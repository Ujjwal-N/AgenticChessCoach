import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGameAnalysisCollection } from "@/lib/mongodb";
import { createGameAnalysisDocument } from "@/lib/schemas";

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

    // Analyze the first game with Gemini API
    let analysis: string | null = null;
    let concepts: string[] = [];
    let opening: string | null = null;
    let detailedAnalysis: string | null = null;
    
    if (selectedGames.length > 0) {
      try {
        const firstGame = selectedGames[0];
        
        // Fetch PGN for the first game
        const pgnResponse = await fetch(
          `https://lichess.org/game/export/${firstGame.id}.pgn`,
          {
            headers: {
              Accept: "application/x-chess-pgn",
            },
          }
        );

        if (pgnResponse.ok) {
          const pgn = await pgnResponse.text();
          
          // Initialize Gemini API
          const apiKey = process.env.GEMINI_API_KEY;
          
          if (apiKey) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const userColor = firstGame.userColor || "white";
            const userColorCapitalized = userColor.charAt(0).toUpperCase() + userColor.slice(1);
            
            const prompt = `I'm going to give you a chess game for analysis.

1) **Game in PGN format:**

${pgn}

**IMPORTANT:** Focus your analysis specifically on the player **${username}** who played as **${userColorCapitalized}**. This is the player whose weaknesses, blind spots, and learning areas you need to identify. Throughout your analysis, emphasize ${userColorCapitalized}'s moves and decisions, as ${username} was the ${userColorCapitalized} player in this game.

**Your task:**

Critically analyze this game to identify **${username}'s** (the ${userColorCapitalized} player) weaknesses, blind spots, and areas for improvement. Focus exclusively on their moves and decisions throughout the game.

**Primary focus areas:**

- **Weaknesses and mistakes**: Identify specific tactical errors, positional mistakes, and strategic blunders made by ${username} (${userColorCapitalized}). What types of mistakes do they repeatedly make?

- **Blind spots**: What patterns or threats does ${username} (${userColorCapitalized}) consistently miss? Are there recurring tactical patterns they fail to see? Do they miss defensive resources or attacking opportunities?

- **Learning areas**: What specific skills does ${username} (${userColorCapitalized}) need to develop? Identify concrete areas for improvement such as:
  * Calculation and tactics
  * Positional understanding
  * Endgame technique
  * Time management
  * Opening preparation
  * Pawn structure handling
  * King safety awareness

- **Patterns of weakness**: Analyze if ${username} (${userColorCapitalized}) struggles more in:
  * Complex vs. simple positions
  * Attacking vs. defending
  * Open vs. closed positions
  * Time pressure situations

- **Critical moments**: Identify the key mistakes and missed opportunities that cost ${username} (${userColorCapitalized}) the most. What should they have done differently?

Be specific and constructive. Point out exact moves or positions where ${username} (${userColorCapitalized}) went wrong and explain what they should have done instead.

**CRITICAL:** You must respond with ONLY valid JSON. No markdown code blocks, no explanations, just pure JSON.

Output format (JSON only):

{
  "detailedAnalysis": "Comprehensive critical analysis covering: 1. Weaknesses and mistakes (specific errors and tactical/positional mistakes made by ${username} (${userColorCapitalized})), 2. Blind spots (patterns and threats consistently missed), 3. Learning areas (concrete skills needing development), 4. Patterns of weakness (when and where ${username} (${userColorCapitalized}) struggles most), 5. Critical moments (key mistakes and missed opportunities that mattered most)",
  "finalAnalysis": "3-5 simple sentences in markdown format highlighting ${username}'s (${userColorCapitalized}) main weaknesses, blind spots, and most important learning areas. Be specific and constructive. Use markdown formatting like **bold** for emphasis on key weaknesses, but keep it simple and readable.",
  "opening": "The exact opening name played in this game. Be specific with variations if applicable. Examples: 'Sicilian Defense: Najdorf Variation', 'Queen's Gambit Declined', 'King's Indian Defense: Classical Variation', 'Ruy Lopez: Berlin Defense'. Return as a single string.",
  "concepts": ["Return EXACTLY 5 chess concepts/tags that are highly specific and information-dense. DO NOT include opening names here - those go in the 'opening' field. Avoid generic terms like 'tactics', 'strategy', 'positional play', 'endgame'. Instead, use precise, specific concepts that actually appeared in this game. Examples of good tags: 'Same-side castling attack', 'Rook and pawn vs rook endgame', 'Back rank weakness exploitation', 'Weak d6 square complex', 'Isolated queen pawn structure', 'Knight outpost on d5', 'Pawn storm on kingside', 'Exchange sacrifice for initiative', 'Central pawn break', 'Piece coordination'. Examples of BAD tags to avoid: 'Chess tactics', 'Positional play', 'Endgame', 'Strategy', 'Middlegame', any opening names. Select the 5 most important and specific concepts that were actually relevant to this game. Return as an array of exactly 5 strings."]
}`;

            const result = await model.generateContent(prompt);
            
            const response = await result.response;
            const responseText = response.text();
            
            // Parse JSON response
            try {
              // Remove markdown code blocks if present
              let jsonText = responseText.trim();
              if (jsonText.startsWith("```json")) {
                jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
              } else if (jsonText.startsWith("```")) {
                jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
              }
              
              const parsedResponse = JSON.parse(jsonText);
              
              // Extract finalAnalysis, concepts, and opening
              analysis = parsedResponse.finalAnalysis || parsedResponse.detailedAnalysis || responseText;
              detailedAnalysis = parsedResponse.detailedAnalysis || null;
              concepts = Array.isArray(parsedResponse.concepts) 
                ? parsedResponse.concepts.slice(0, 5) // Limit to 5 concepts
                : [];
              opening = parsedResponse.opening || null;
              
              // Save analysis to MongoDB for the first game
              const analysisDoc = createGameAnalysisDocument(
                firstGame,
                username,
                {
                  finalAnalysis: analysis || undefined,
                  detailedAnalysis: detailedAnalysis || undefined,
                  opening: opening || undefined,
                  concepts: concepts.length > 0 ? concepts : undefined,
                },
                pgn
              );
              
              await collection.updateOne(
                { gameId: firstGame.id, username: username.toLowerCase() },
                { 
                  $set: {
                    ...analysisDoc,
                    updatedAt: new Date(),
                  }
                },
                { upsert: true }
              );
            } catch (parseError) {
              console.error("❌ Failed to parse JSON response:", parseError);
              analysis = responseText;
            }
          }
        }
      } catch (error) {
        console.error("❌ Error analyzing game with Gemini:", error);
        if (error instanceof Error) {
          console.error("❌ Error message:", error.message);
          console.error("❌ Error stack:", error.stack);
        }
        // Continue without analysis if Gemini fails
      }
    }

    return NextResponse.json({
      games: selectedGames,
      count: selectedGames.length,
      wins: wins.length,
      losses: losses.length,
      draws: draws.length,
      analysis,
      concepts,
      opening,
    });
  } catch (error) {
    console.error("Error fetching Lichess games:", error);
    return NextResponse.json(
      { error: "Failed to fetch games" },
      { status: 500 }
    );
  }
}

