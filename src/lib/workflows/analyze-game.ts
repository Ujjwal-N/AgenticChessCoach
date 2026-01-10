import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGameAnalysisCollection } from "@/lib/mongodb";
import { createGameAnalysisDocument } from "@/lib/schemas";
import { FatalError } from "workflow";

interface GameAnalysisInput {
  gameId: string;
  username: string;
  userColor: "white" | "black";
  game: any; // The processed game object
}

// Step: Fetch PGN from Lichess
export async function fetchPGN(gameId: string) {
  "use step";
  
  const pgnResponse = await fetch(
    `https://lichess.org/game/export/${gameId}.pgn`,
    {
      headers: {
        Accept: "application/x-chess-pgn",
      },
    }
  );

  if (!pgnResponse.ok) {
    throw new FatalError(`Failed to fetch PGN: ${pgnResponse.status}`);
  }

  return await pgnResponse.text();
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
    
    return {
      finalAnalysis: parsedResponse.finalAnalysis || parsedResponse.detailedAnalysis || responseText,
      detailedAnalysis: parsedResponse.detailedAnalysis || null,
      concepts: Array.isArray(parsedResponse.concepts) 
        ? parsedResponse.concepts.slice(0, 5)
        : [],
      opening: parsedResponse.opening || null,
    };
  } catch (parseError) {
    // If parsing fails, return the raw text as finalAnalysis
    return {
      finalAnalysis: responseText,
      detailedAnalysis: null,
      concepts: [],
      opening: null,
    };
  }
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
  },
  pgn: string
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
  
  // Step 3: Save to MongoDB (with automatic retry)
  await saveAnalysisToMongoDB(game, username, analysis, pgn);
  
  return {
    success: true,
    gameId,
    analysis: {
      finalAnalysis: analysis.finalAnalysis,
      concepts: analysis.concepts,
      opening: analysis.opening,
    },
  };
}

