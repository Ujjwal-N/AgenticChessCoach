import { NextRequest, NextResponse } from "next/server";

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
      throw new Error(`Lichess API error: ${response.status}`);
    }

    // Parse NDJSON response (newline-delimited JSON)
    const text = await response.text();
    const rawGames = text
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    // Process each game
    const processedGames: ProcessedGame[] = rawGames.map((game: any) => {
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

      // Calculate game duration
      const duration = game.lastMoveAt - game.createdAt;

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

    // Select games: ideal split is 4 wins, 4 losses, 2 draws
    const targetCount = 10;
    let selectedGames: ProcessedGame[] = [];
    const selectedGameIds = new Set<string>();
    
    // Determine how many of each type to take
    const winsCount = Math.min(4, wins.length);
    const lossesCount = Math.min(4, losses.length);
    const drawsCount = Math.min(2, draws.length);
    
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

    // Limit to 10 games total
    selectedGames = selectedGames.slice(0, targetCount);

    return NextResponse.json({
      games: selectedGames,
      count: selectedGames.length,
      wins: wins.length,
      losses: losses.length,
      draws: draws.length,
    });
  } catch (error) {
    console.error("Error fetching Lichess games:", error);
    return NextResponse.json(
      { error: "Failed to fetch games" },
      { status: 500 }
    );
  }
}

