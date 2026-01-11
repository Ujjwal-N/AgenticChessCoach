import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGameAnalysisCollection } from "@/lib/mongodb";
import { createGameAnalysisDocument } from "@/lib/schemas";
import { FatalError } from "workflow";
import { synthesizeUserAnalysisWorkflow } from "./synthesize-user-analysis";
import { lookAlikeGamesWorkflow } from "./lookalike-games";

interface GameAnalysisInput {
  gameId: string;
  username: string;
  userColor: "white" | "black";
  game: any; // The processed game object
}

// Step: Fetch PGN from Lichess
export async function fetchPGN(gameId: string) {
  "use step";
  
  if (!gameId || typeof gameId !== "string" || gameId.trim().length === 0) {
    throw new FatalError("Invalid gameId provided to fetchPGN");
  }
  
  const pgnResponse = await fetch(
    `https://lichess.org/game/export/${gameId}.pgn`,
    {
      headers: {
        Accept: "application/x-chess-pgn",
      },
    }
  );

  if (!pgnResponse.ok) {
    if (pgnResponse.status === 404) {
      throw new FatalError(`Game not found: ${gameId}`);
    }
    if (pgnResponse.status === 429) {
      throw new FatalError(`Rate limited by Lichess API`);
    }
    throw new FatalError(`Failed to fetch PGN: ${pgnResponse.status}`);
  }

  const pgnText = await pgnResponse.text();
  
  if (!pgnText || pgnText.trim().length === 0) {
    throw new FatalError(`Empty PGN response for game ${gameId}`);
  }

  return pgnText;
}

// Step: Analyze game with Gemini AI
export async function analyzeGameWithGemini(
  pgn: string,
  username: string,
  userColor: "white" | "black"
) {
  "use step";
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new FatalError("GEMINI_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const userColorCapitalized = userColor.charAt(0).toUpperCase() + userColor.slice(1);
  
  const prompt = `I'm going to give you a chess game for analysis.

1) **Game in PGN format:**

${pgn}

**IMPORTANT:** Focus your analysis specifically on the player **${username}** who played as **${userColorCapitalized}**. This is the player whose weaknesses, blind spots, and learning areas you need to identify. Throughout your analysis, emphasize ${userColorCapitalized}'s moves and decisions, as ${username} was the ${userColorCapitalized} player in this game.

**Your task:**

First, evaluate whether this game is representative of **${username}'s** (${userColorCapitalized}) skill level and suitable for meaningful analysis. Then, if the game is representative, critically analyze it to identify weaknesses, blind spots, and areas for improvement.

**Step 1: Evaluate Game Representativeness**

Before analyzing, determine if this game should be considered for analysis. A game is NOT representative and should be marked as false if:

- **Too short**: The game ended too quickly (e.g., fewer than 15-20 moves) due to early blunders, resignations, or timeouts that don't reflect normal play
- **Opponent played weakly**: The opponent made obvious blunders, played significantly below their rating level, or made moves that suggest they weren't trying (e.g., multiple one-move blunders, hanging pieces repeatedly)
- **Abnormal circumstances**: The game ended due to external factors rather than chess skill (e.g., connection issues, accidental resignations, extreme time pressure that's not typical)
- **Unrated or casual play**: The game was clearly not serious competitive play

A game IS representative if:
- It lasted a reasonable number of moves (typically 20+ moves)
- Both players played at a level consistent with their ratings
- The game reflects normal competitive chess play
- The outcome was determined by chess skill rather than external factors

**Step 2: Analyze the Game (if representative)**

If the game is representative, critically analyze it to identify **${username}'s** (the ${userColorCapitalized} player) weaknesses, blind spots, and areas for improvement. Focus exclusively on their moves and decisions throughout the game.

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
  "isRepresentative": true or false, // Boolean indicating if this game is representative of the user's skill level and suitable for analysis. Set to false if the game is too short, opponent played weakly, or other factors make it unsuitable for meaningful analysis.
  "detailedAnalysis": "If isRepresentative is true: Comprehensive critical analysis covering: 1. Weaknesses and mistakes (specific errors and tactical/positional mistakes made by ${username} (${userColorCapitalized})), 2. Blind spots (patterns and threats consistently missed), 3. Learning areas (concrete skills needing development), 4. Patterns of weakness (when and where ${username} (${userColorCapitalized}) struggles most), 5. Critical moments (key mistakes and missed opportunities that mattered most). If isRepresentative is false: Brief explanation of why the game is not representative (e.g., 'Game ended too early due to early blunder', 'Opponent played significantly below their rating level', etc.)",
  "finalAnalysis": "If isRepresentative is true: 3-5 simple sentences in markdown format highlighting ${username}'s (${userColorCapitalized}) main weaknesses, blind spots, and most important learning areas. Be specific and constructive. Use markdown formatting like **bold** for emphasis on key weaknesses, but keep it simple and readable. If isRepresentative is false: A brief note explaining why this game is not suitable for analysis.",
  "opening": "The exact opening name played in this game. Be specific with variations if applicable. Examples: 'Sicilian Defense: Najdorf Variation', 'Queen's Gambit Declined', 'King's Indian Defense: Classical Variation', 'Ruy Lopez: Berlin Defense'. Return as a single string. If isRepresentative is false, still return the opening name if identifiable.",
  "concepts": ["If isRepresentative is true: Return EXACTLY 5 chess concepts/tags that are highly specific and information-dense. DO NOT include opening names here - those go in the 'opening' field. Avoid generic terms like 'tactics', 'strategy', 'positional play', 'endgame'. Instead, use precise, specific concepts that actually appeared in this game. Examples of good tags: 'Same-side castling attack', 'Rook and pawn vs rook endgame', 'Back rank weakness exploitation', 'Weak d6 square complex', 'Isolated queen pawn structure', 'Knight outpost on d5', 'Pawn storm on kingside', 'Exchange sacrifice for initiative', 'Central pawn break', 'Piece coordination'. Examples of BAD tags to avoid: 'Chess tactics', 'Positional play', 'Endgame', 'Strategy', 'Middlegame', any opening names. Select the 5 most important and specific concepts that were actually relevant to this game. Return as an array of exactly 5 strings. If isRepresentative is false: Return an empty array []."]
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
    
    return {
      finalAnalysis: parsedResponse.finalAnalysis || parsedResponse.detailedAnalysis || responseText,
      detailedAnalysis: parsedResponse.detailedAnalysis || null,
      concepts: Array.isArray(parsedResponse.concepts) 
        ? parsedResponse.concepts.slice(0, 5)
        : [],
      opening: parsedResponse.opening || null,
      isRepresentative: parsedResponse.isRepresentative !== undefined 
        ? Boolean(parsedResponse.isRepresentative)
        : true, // Default to true if not provided for backward compatibility
    };
  } catch (parseError) {
    // If parsing fails, return the raw text as finalAnalysis
    return {
      finalAnalysis: responseText,
      detailedAnalysis: null,
      concepts: [],
      opening: null,
      isRepresentative: true, // Default to true if parsing fails
    };
  }
}

// Step: Check how many games with analysis exist for this user
export async function checkGamesCount(username: string) {
  "use step";
  
  const collection = await getGameAnalysisCollection();
  // Count only games that have completed analysis (have analysis.finalAnalysis)
  const count = await collection.countDocuments({
    username: username.toLowerCase(),
    "analysis.finalAnalysis": { $exists: true, $ne: null },
  });
  
  return count;
}

// Step: Save analysis to MongoDB
export async function saveAnalysisToMongoDB(
  game: any,
  username: string,
  analysis: {
    finalAnalysis: string;
    detailedAnalysis: string | null;
    concepts: string[];
    opening: string | null;
    isRepresentative: boolean;
  },
  pgn: string,
  original: boolean
) {
  "use step";
  
  const collection = await getGameAnalysisCollection();
  
  const analysisDoc = createGameAnalysisDocument(
    game,
    username,
    {
      finalAnalysis: analysis.finalAnalysis || undefined,
      detailedAnalysis: analysis.detailedAnalysis || undefined,
      opening: analysis.opening || undefined,
      concepts: analysis.concepts.length > 0 ? analysis.concepts : undefined,
      isRepresentative: analysis.isRepresentative,
      original: original,
    },
    pgn
  );
  
  await collection.updateOne(
    { gameId: game.id, username: username.toLowerCase() },
    { 
      $set: {
        ...analysisDoc,
        updatedAt: new Date(),
      }
    },
    { upsert: true }
  );
  
  return { success: true, gameId: game.id };
}

// Workflow: Analyze a chess game
export async function analyzeGameWorkflow(input: GameAnalysisInput) {
  "use workflow";
  
  const { gameId, username, userColor, game } = input;
  
  // Step 1: Fetch PGN (with automatic retry)
  const pgn = await fetchPGN(gameId);
  
  // Step 2: Analyze with Gemini (with automatic retry)
  const analysis = await analyzeGameWithGemini(pgn, username, userColor);
  
  // Step 3: Check how many games exist for this user (before saving this one)
  const gamesCountBefore = await checkGamesCount(username);
  
  // Step 4: Determine if this is an "original" game (part of first 10)
  const original = gamesCountBefore < 10;
  
  // Step 5: Save to MongoDB (with automatic retry)
  await saveAnalysisToMongoDB(game, username, analysis, pgn, original);
  
  // Step 6: Check count after saving to see if we just reached 10 games
  const gamesCountAfter = await checkGamesCount(username);
  
  // Step 7: Trigger user synthesis workflow (non-blocking, runs in background)
  // This will check if 3+ games have analysis and synthesize if so
  synthesizeUserAnalysisWorkflow({ username }).catch((error) => {
    // Log errors but don't fail the game analysis workflow
    console.error(`❌ Error in user synthesis workflow for ${username}:`, error);
  });
  
  // Step 8: Trigger look-alike games workflow if we just reached 10 games or added a non-original game (non-blocking)
  // This will process non-original games to find thematic matches
  if (gamesCountAfter === 10 || (!original && gamesCountAfter > 10)) {
    console.log(`[AnalyzeGame] Triggering look-alike workflow for ${username} (${gamesCountAfter} games analyzed, original=${original})`);
    lookAlikeGamesWorkflow({ username }).catch((error) => {
      // Log errors but don't fail the game analysis workflow
      console.error(`❌ Error in look-alike games workflow for ${username}:`, error);
    });
  }
  
  return {
    success: true,
    gameId,
    analysis: {
      finalAnalysis: analysis.finalAnalysis,
      concepts: analysis.concepts,
      opening: analysis.opening,
      original: original,
    },
  };
}

