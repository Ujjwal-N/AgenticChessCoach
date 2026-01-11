import { NextRequest, NextResponse } from "next/server";
import { getGameAnalysisCollection } from "@/lib/mongodb";
import { createGameAnalysisDocument } from "@/lib/schemas";
import { analyzeGameWorkflow } from "@/lib/workflows/analyze-game";

interface ProcessedGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  perf: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  players: {
    white?: { user?: { name: string; id: string }; rating?: number };
    black?: { user?: { name: string; id: string }; rating?: number };
  };
  winner?: string;
  opening?: { name: string };
  // Computed fields
  userColor?: "white" | "black";
  opponentRating?: number;
  ratingDiff?: number;
  duration?: number;
  result?: "win" | "loss" | "draw";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  try {
    // Calculate date 2 months ago
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const sinceTimestamp = twoMonthsAgo.getTime();

    // Fetch games from Lichess API
    const lichessUrl = `https://lichess.org/api/games/user/${username}?since=${sinceTimestamp}&max=100`;
    
    const response = await fetch(lichessUrl, {
      headers: {
        Accept: "application/x-ndjson",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`Lichess API error: ${response.status}`, errorText.substring(0, 200));
      return NextResponse.json(
        { error: `Failed to fetch games: ${response.status === 500 ? "Lichess service unavailable" : "Unknown error"}` },
        { status: response.status >= 500 ? 503 : 500 }
      );
    }

    // Parse NDJSON response (newline-delimited JSON)
    const text = await response.text();
    const rawGames = text
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (parseError) {
          console.warn("Failed to parse game line:", line.substring(0, 100));
          return null;
        }
      })
      .filter((game) => game !== null);

    // Process each game
    const processedGames: ProcessedGame[] = rawGames
      .filter((game: any) => game && game.id && game.players) // Filter out invalid games
      .map((game: any) => {
      // Determine user color
      const userPlayedWhite = game.players.white?.user?.id?.toLowerCase() === username.toLowerCase();
      const userPlayedBlack = game.players.black?.user?.id?.toLowerCase() === username.toLowerCase();
      
      let userColor: "white" | "black" | undefined;
      let userRating: number | undefined;
      let opponentRating: number | undefined;
      
      if (userPlayedWhite) {
        userColor = "white";
        userRating = game.players.white?.rating;
        opponentRating = game.players.black?.rating;
      } else if (userPlayedBlack) {
        userColor = "black";
        userRating = game.players.black?.rating;
        opponentRating = game.players.white?.rating;
      }

      // Calculate game duration (defensive check for valid timestamps)
      const duration = (game.lastMoveAt && game.createdAt && 
                       typeof game.lastMoveAt === 'number' && 
                       typeof game.createdAt === 'number')
        ? game.lastMoveAt - game.createdAt
        : undefined;

      // Calculate rating difference
      const ratingDiff = userRating && opponentRating 
        ? Math.abs(userRating - opponentRating)
        : undefined;

      // Determine result
      let result: "win" | "loss" | "draw" | undefined;
      if (game.status === "draw" || !game.winner) {
        result = "draw";
      } else if (userColor === "white" && game.winner === "white") {
        result = "win";
      } else if (userColor === "black" && game.winner === "black") {
        result = "win";
      } else if (userColor && game.winner) {
        result = "loss";
      }

      return {
        ...game,
        userColor,
        opponentRating,
        ratingDiff: ratingDiff ?? 0,
        duration,
        result,
      };
    }).filter((game: ProcessedGame) => game.userColor !== undefined); // Filter out games where user wasn't found

    // Sort by duration (descending), then rating difference (ascending)
    processedGames.sort((a, b) => {
      const durationDiff = (b.duration ?? 0) - (a.duration ?? 0);
      if (durationDiff !== 0) return durationDiff;
      return (a.ratingDiff ?? 0) - (b.ratingDiff ?? 0);
    });

    // Separate into wins, losses, and draws
    const wins = processedGames.filter((game) => game.result === "win");
    const losses = processedGames.filter((game) => game.result === "loss");
    const draws = processedGames.filter((game) => game.result === "draw");

    // Select games: analyze 25 games with ideal split of 10 wins, 10 losses, 5 draws
    const targetCount = 25;
    const maxReturnCount = 15; // Maximum games to return to frontend
    let selectedGames: ProcessedGame[] = [];
    const selectedGameIds = new Set<string>();
    
    // Determine how many of each type to take (proportional to 25 games)
    const winsCount = Math.min(10, wins.length);
    const lossesCount = Math.min(10, losses.length);
    const drawsCount = Math.min(5, draws.length);
    
    // Take wins, losses, and draws
    selectedGames = [
      ...wins.slice(0, winsCount),
      ...losses.slice(0, lossesCount),
      ...draws.slice(0, drawsCount),
    ];
    selectedGames.forEach((game) => selectedGameIds.add(game.id));
    
    // If we still need more games, fill from the remaining sorted games
    const remaining = processedGames.filter(
      (game) => !selectedGameIds.has(game.id)
    );
    const needed = targetCount - selectedGames.length;
    if (needed > 0 && remaining.length > 0) {
      const additional = remaining.slice(0, needed);
      selectedGames.push(...additional);
      additional.forEach((game) => selectedGameIds.add(game.id));
    }

    // Limit to 25 games total for analysis
    selectedGames = selectedGames.slice(0, targetCount);
    
    // Prepare games to return (limit to 15 max)
    const gamesToReturn = selectedGames.slice(0, maxReturnCount);

    // Save all selected games to MongoDB
    const collection = await getGameAnalysisCollection();
    const savePromises = selectedGames.map(async (game) => {
      const doc = createGameAnalysisDocument(game, username);
      // Use upsert to avoid duplicates (update if exists, insert if not)
      await collection.updateOne(
        { gameId: game.id, username: username.toLowerCase() },
        { $set: doc },
        { upsert: true }
      );
    });
    await Promise.all(savePromises);

    // Trigger workflows to analyze all selected games (non-blocking)
    // Each workflow will handle fetching PGN, analyzing with Gemini, and saving results
    // Workflows run in parallel, each with automatic retries
    selectedGames.forEach((game) => {
      if (!game || !game.id) {
        console.warn("Skipping invalid game in workflow trigger");
        return;
      }
      analyzeGameWorkflow({
        gameId: game.id,
        username,
        userColor: game.userColor || "white",
        game: game,
      }).catch((error) => {
        // Log errors but don't fail the request
        console.error(`❌ Error in game analysis workflow for game ${game.id}:`, error);
      });
    });

    return NextResponse.json({
      success: true,
      count: selectedGames.length,
      gamesAnalyzed: selectedGames.length,
      gamesReturned: gamesToReturn.length,
      games: gamesToReturn.map((game) => ({
        id: game.id,
        gameId: game.id,
        rated: game.rated,
        variant: game.variant,
        speed: game.speed,
        perf: game.perf,
        createdAt: game.createdAt,
        lastMoveAt: game.lastMoveAt,
        status: game.status,
        winner: game.winner,
        players: game.players,
        opening: game.opening,
        userColor: game.userColor,
        userRating: game.userColor === "white" 
          ? game.players.white?.rating 
          : game.players.black?.rating,
        opponentRating: game.opponentRating,
        ratingDiff: game.ratingDiff,
        duration: game.duration,
        result: game.result,
      })),
    });
  } catch (error) {
    console.error("Error fetching Lichess games:", error);
    return NextResponse.json(
      { error: "Failed to fetch games" },
      { status: 500 }
    );
  }
}

