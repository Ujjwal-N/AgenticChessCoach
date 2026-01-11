import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGameAnalysisCollection, getUserAnalysisCollection } from "@/lib/mongodb";
import { FatalError } from "workflow";
import { sleep } from "workflow";

interface LookAlikeGamesInput {
  username: string;
}

// Step: Verify user has at least 10 analyzed games
export async function verifyTenGamesAnalyzed(username: string) {
  "use step";
  
  const collection = await getGameAnalysisCollection();
  const count = await collection.countDocuments({
    username: username.toLowerCase(),
    "analysis.finalAnalysis": { $exists: true, $ne: null },
  });
  
  return {
    count,
    hasTenGames: count >= 10,
  };
}

// Step: Get synthesized user analysis
export async function getUserSynthesis(username: string) {
  "use step";
  
  const collection = await getUserAnalysisCollection();
  const userAnalysis = await collection.findOne({
    username: username.toLowerCase(),
  });
  
  if (!userAnalysis) {
    throw new FatalError(`No synthesized analysis found for ${username}`);
  }
  
  return userAnalysis;
}

// Step: Get original games (first 10)
export async function getOriginalGames(username: string) {
  "use step";
  
  const collection = await getGameAnalysisCollection();
  const originalGames = await collection
    .find({
      username: username.toLowerCase(),
      "analysis.original": true,
      "analysis.finalAnalysis": { $exists: true, $ne: null },
    })
    .sort({ "analysis.analyzedAt": 1 }) // Sort by analyzedAt ascending to get first 10
    .limit(10)
    .toArray();
  
  return originalGames;
}

// Step: Get non-original games that haven't been checked for look-alikes
export async function getNonOriginalGames(username: string) {
  "use step";
  
  const collection = await getGameAnalysisCollection();
  const nonOriginalGames = await collection
    .find({
      username: username.toLowerCase(),
      $or: [
        { "analysis.original": false },
        { "analysis.original": { $exists: false } },
      ],
      "analysis.finalAnalysis": { $exists: true, $ne: null },
      "analysis.isValidLookAlike": { $exists: false }, // Not yet checked
    })
    .toArray();
  
  return nonOriginalGames;
}

// Step: Analyze if non-original game is a look-alike of original games
export async function analyzeLookAlikeGame(
  username: string,
  nonOriginalGame: any,
  originalGames: any[],
  userSynthesis: any
) {
  "use step";
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new FatalError("GEMINI_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Prepare original games summaries
  const originalGamesSummary = originalGames.map((game, index) => {
    const analysis = game.analysis || {};
    return {
      gameId: game.gameId,
      gameNumber: index + 1,
      opening: analysis.opening || "Unknown",
      concepts: analysis.concepts || [],
      finalAnalysis: analysis.finalAnalysis || "",
      result: game.result,
    };
  });

  // Extract user tags/concepts from synthesis
  const userConcepts = userSynthesis.commonConcepts || [];
  const userStrengths = userSynthesis.strengths || [];
  const userWeaknesses = userSynthesis.weaknesses || [];
  const userBlindSpots = userSynthesis.blindSpots || [];

  const nonOriginalAnalysis = nonOriginalGame.analysis || {};
  
  const prompt = `You are analyzing a chess game to determine if it displays thematic elements similar to the player's original games.

**Player:** ${username}

**User Profile (from synthesized analysis):**
- Common Concepts/Tags: ${userConcepts.join(", ") || "None"}
- Strengths: ${userStrengths.join(", ") || "None"}
- Weaknesses: ${userWeaknesses.join(", ") || "None"}
- Blind Spots: ${userBlindSpots.join(", ") || "None"}

**Original Games (First 10 analyzed games):**

${originalGamesSummary.map((g) => `
**Original Game ${g.gameNumber} (ID: ${g.gameId}):**
- Opening: ${g.opening}
- Concepts: ${g.concepts.join(", ") || "None"}
- Result: ${g.result}
- Analysis: ${g.finalAnalysis}
`).join("\n---\n")}

**Non-Original Game to Analyze:**
- Game ID: ${nonOriginalGame.gameId}
- Opening: ${nonOriginalAnalysis.opening || "Unknown"}
- Concepts: ${(nonOriginalAnalysis.concepts || []).join(", ") || "None"}
- Result: ${nonOriginalGame.result}
- Analysis: ${nonOriginalAnalysis.finalAnalysis || ""}

**Your task:**

Determine if this non-original game displays thematic elements similar to any of the original games. A game is a "look-alike" if it demonstrates:

1. **Similar tactical patterns**: Same types of tactical mistakes, missed opportunities, or tactical themes
2. **Similar positional patterns**: Similar positional weaknesses, blind spots, or strategic errors
3. **Similar concepts**: Overlapping chess concepts/tags with original games
4. **Similar playing patterns**: Demonstrates the same strengths, weaknesses, or blind spots identified in the user profile

If this game IS a look-alike:
- Identify which original game(s) it most closely resembles
- Explain the thematic connections
- Provide updated analysis that contextualizes this game in relation to the user's patterns and the original game(s)

If this game is NOT a look-alike:
- Explain why it doesn't match the thematic patterns
- Note any unique aspects

**CRITICAL:** You must respond with ONLY valid JSON. No markdown code blocks, no explanations, just pure JSON.

Output format (JSON only):

{
  "isValidLookAlike": true or false,
  "thematicMatch": "If isValidLookAlike is true: Explain the thematic elements that match, referencing specific original games and concepts. If false: Brief explanation of why it's not a match.",
  "matchedOriginalGameIds": ["If isValidLookAlike is true: Array of game IDs from original games that this game most closely resembles. If false: Empty array []."],
  "updatedAnalysis": "If isValidLookAlike is true: Enhanced analysis that contextualizes this game in relation to the user's playing patterns and the matched original game(s). Reference specific patterns, concepts, and how this game reinforces or differs from established patterns. If false: The original analysis unchanged.",
  "thematicConnections": "If isValidLookAlike is true: Specific chess concepts, tactical patterns, or positional themes that connect this game to the original games. If false: Empty string."
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
      isValidLookAlike: parsedResponse.isValidLookAlike === true,
      thematicMatch: parsedResponse.thematicMatch || "",
      matchedOriginalGameIds: Array.isArray(parsedResponse.matchedOriginalGameIds)
        ? parsedResponse.matchedOriginalGameIds
        : [],
      updatedAnalysis: parsedResponse.updatedAnalysis || nonOriginalAnalysis.finalAnalysis || "",
      thematicConnections: parsedResponse.thematicConnections || "",
    };
  } catch (parseError) {
    // If parsing fails, default to not a look-alike
    return {
      isValidLookAlike: false,
      thematicMatch: "Failed to parse analysis response",
      matchedOriginalGameIds: [],
      updatedAnalysis: nonOriginalAnalysis.finalAnalysis || "",
      thematicConnections: "",
    };
  }
}

// Step: Update game analysis with look-alike information
export async function updateGameWithLookAlike(
  username: string,
  gameId: string,
  lookAlikeAnalysis: {
    isValidLookAlike: boolean;
    thematicMatch: string;
    matchedOriginalGameIds: string[];
    updatedAnalysis: string;
    thematicConnections: string;
  }
) {
  "use step";
  
  const collection = await getGameAnalysisCollection();
  const now = new Date();
  
  // Build update object
  const updateFields: any = {
    "analysis.isValidLookAlike": lookAlikeAnalysis.isValidLookAlike,
    "analysis.thematicMatch": lookAlikeAnalysis.thematicMatch,
    "analysis.matchedOriginalGameIds": lookAlikeAnalysis.matchedOriginalGameIds,
    "analysis.thematicConnections": lookAlikeAnalysis.thematicConnections,
    updatedAt: now,
  };
  
  // Only update finalAnalysis if it's a valid look-alike and we have updated analysis
  if (lookAlikeAnalysis.isValidLookAlike && lookAlikeAnalysis.updatedAnalysis) {
    updateFields["analysis.finalAnalysis"] = lookAlikeAnalysis.updatedAnalysis;
  }
  
  await collection.updateOne(
    { gameId: gameId, username: username.toLowerCase() },
    { $set: updateFields }
  );
  
  return { success: true, gameId, isValidLookAlike: lookAlikeAnalysis.isValidLookAlike };
}

// Workflow: Process look-alike games
export async function lookAlikeGamesWorkflow(input: LookAlikeGamesInput) {
  "use workflow";
  
  const { username } = input;
  
  // Step 1: Verify user has at least 10 analyzed games (with retry logic)
  let verificationResult = await verifyTenGamesAnalyzed(username);
  let retryCount = 0;
  const maxRetries = 5;
  const retryDelay = 30000; // 30 seconds
  
  while (!verificationResult.hasTenGames && retryCount < maxRetries) {
    console.log(`[LookAlike] Only ${verificationResult.count} games analyzed for ${username}, need 10. Retrying in ${retryDelay/1000}s... (attempt ${retryCount + 1}/${maxRetries})`);
    await sleep(retryDelay);
    verificationResult = await verifyTenGamesAnalyzed(username);
    retryCount++;
  }
  
  if (!verificationResult.hasTenGames) {
    console.log(`[LookAlike] Failed to verify 10 games after ${maxRetries} retries for ${username}`);
    return {
      success: false,
      reason: "insufficient_games",
      gamesAnalyzed: verificationResult.count,
      required: 10,
    };
  }
  
  console.log(`[LookAlike] Verified ${verificationResult.count} games analyzed for ${username}`);
  
  // Step 2: Get synthesized user analysis
  const userSynthesis = await getUserSynthesis(username);
  
  // Step 3: Get original games (first 10)
  const originalGames = await getOriginalGames(username);
  
  if (originalGames.length < 10) {
    console.log(`[LookAlike] Only ${originalGames.length} original games found for ${username}, need 10`);
    return {
      success: false,
      reason: "insufficient_original_games",
      originalGamesFound: originalGames.length,
      required: 10,
    };
  }
  
  // Step 4: Get non-original games that haven't been checked
  const nonOriginalGames = await getNonOriginalGames(username);
  
  if (nonOriginalGames.length === 0) {
    console.log(`[LookAlike] No non-original games to process for ${username}`);
    return {
      success: true,
      gamesProcessed: 0,
      message: "No non-original games to check",
    };
  }
  
  console.log(`[LookAlike] Processing ${nonOriginalGames.length} non-original games for ${username}`);
  
  // Step 5: Process each non-original game
  const results = [];
  for (const game of nonOriginalGames) {
    try {
      // Analyze if it's a look-alike
      const lookAlikeAnalysis = await analyzeLookAlikeGame(
        username,
        game,
        originalGames,
        userSynthesis
      );
      
      // Update game with look-alike information
      const updateResult = await updateGameWithLookAlike(
        username,
        game.gameId,
        lookAlikeAnalysis
      );
      
      results.push({
        gameId: game.gameId,
        isValidLookAlike: lookAlikeAnalysis.isValidLookAlike,
        success: true,
      });
      
      console.log(`[LookAlike] Processed game ${game.gameId} for ${username}: isValidLookAlike=${lookAlikeAnalysis.isValidLookAlike}`);
    } catch (error) {
      console.error(`[LookAlike] Error processing game ${game.gameId} for ${username}:`, error);
      results.push({
        gameId: game.gameId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  
  const validLookAlikes = results.filter((r) => r.success && r.isValidLookAlike).length;
  
  return {
    success: true,
    gamesProcessed: results.length,
    validLookAlikes: validLookAlikes,
    results: results,
  };
}

