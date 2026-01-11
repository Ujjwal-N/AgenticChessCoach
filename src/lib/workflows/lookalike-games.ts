import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGameAnalysisCollection, getUserAnalysisCollection } from "@/lib/mongodb";
import { sleep } from "workflow";

interface LookAlikeGamesInput {
  username: string;
}

// Step: Verify user has at least 10 analyzed games
export async function verifyTenGamesAnalyzed(username: string) {
  "use step";
  
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    console.warn(`[LookAlike] Invalid username provided: ${username}`);
    return {
      count: 0,
      hasTenGames: false,
    };
  }
  
  try {
    const collection = await getGameAnalysisCollection();
    const count = await collection.countDocuments({
      username: username.toLowerCase().trim(),
      "analysis.finalAnalysis": { $exists: true, $ne: null },
    });
    
    return {
      count: count || 0,
      hasTenGames: count >= 10,
    };
  } catch (error) {
    console.error(`[LookAlike] Error verifying games count for ${username}:`, error);
    return {
      count: 0,
      hasTenGames: false,
    };
  }
}

// Step: Get synthesized user analysis
export async function getUserSynthesis(username: string) {
  "use step";
  
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    console.warn(`[LookAlike] Invalid username provided: ${username}`);
    return null;
  }
  
  try {
    const collection = await getUserAnalysisCollection();
    const userAnalysis = await collection.findOne({
      username: username.toLowerCase().trim(),
    });
    
    if (!userAnalysis) {
      console.log(`[LookAlike] No synthesized analysis found for ${username}`);
      return null;
    }
    
    return userAnalysis;
  } catch (error) {
    console.error(`[LookAlike] Error fetching user synthesis for ${username}:`, error);
    return null;
  }
}

// Step: Get original games (first 10)
export async function getOriginalGames(username: string) {
  "use step";
  
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    console.warn(`[LookAlike] Invalid username provided: ${username}`);
    return [];
  }
  
  try {
    const collection = await getGameAnalysisCollection();
    const originalGames = await collection
      .find({
        username: username.toLowerCase().trim(),
        "analysis.original": true,
        "analysis.finalAnalysis": { $exists: true, $ne: null },
      })
      .sort({ "analysis.analyzedAt": 1 }) // Sort by analyzedAt ascending to get first 10
      .limit(10)
      .toArray();
    
    return Array.isArray(originalGames) ? originalGames : [];
  } catch (error) {
    console.error(`[LookAlike] Error fetching original games for ${username}:`, error);
    return [];
  }
}

// Step: Get non-original games that haven't been checked for look-alikes
export async function getNonOriginalGames(username: string) {
  "use step";
  
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    console.warn(`[LookAlike] Invalid username provided: ${username}`);
    return [];
  }
  
  try {
    const collection = await getGameAnalysisCollection();
    const nonOriginalGames = await collection
      .find({
        username: username.toLowerCase().trim(),
        $or: [
          { "analysis.original": false },
          { "analysis.original": { $exists: false } },
        ],
        "analysis.finalAnalysis": { $exists: true, $ne: null },
        "analysis.isValidLookAlike": { $exists: false }, // Not yet checked
      })
      .toArray();
    
    return Array.isArray(nonOriginalGames) ? nonOriginalGames : [];
  } catch (error) {
    console.error(`[LookAlike] Error fetching non-original games for ${username}:`, error);
    return [];
  }
}

// Step: Analyze if non-original game is a look-alike of original games
export async function analyzeLookAlikeGame(
  username: string,
  nonOriginalGame: any,
  originalGames: any[],
  userSynthesis: any
) {
  "use step";
  
  // Defensive checks
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    console.warn(`[LookAlike] Invalid username in analyzeLookAlikeGame: ${username}`);
    return getDefaultLookAlikeResponse(nonOriginalGame);
  }
  
  if (!nonOriginalGame || !nonOriginalGame.gameId) {
    console.warn(`[LookAlike] Invalid nonOriginalGame provided`);
    return getDefaultLookAlikeResponse(nonOriginalGame);
  }
  
  if (!Array.isArray(originalGames) || originalGames.length === 0) {
    console.warn(`[LookAlike] No original games provided for comparison`);
    return getDefaultLookAlikeResponse(nonOriginalGame);
  }
  
  if (!userSynthesis) {
    console.warn(`[LookAlike] No user synthesis provided, using empty profile`);
  }
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    console.error(`[LookAlike] GEMINI_API_KEY is not set or invalid`);
    return getDefaultLookAlikeResponse(nonOriginalGame);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Prepare original games summaries with defensive checks
    const originalGamesSummary = (originalGames || []).map((game, index) => {
      if (!game) return null;
      const analysis = game.analysis || {};
      return {
        gameId: game.gameId || `unknown-${index}`,
        gameNumber: index + 1,
        opening: analysis.opening || "Unknown",
        concepts: Array.isArray(analysis.concepts) ? analysis.concepts : [],
        finalAnalysis: analysis.finalAnalysis || "",
        result: game.result || "unknown",
      };
    }).filter((g) => g !== null);

    if (originalGamesSummary.length === 0) {
      console.warn(`[LookAlike] No valid original games to compare`);
      return getDefaultLookAlikeResponse(nonOriginalGame);
    }

    // Extract user tags/concepts from synthesis with defensive checks
    const userConcepts = Array.isArray(userSynthesis?.commonConcepts) ? userSynthesis.commonConcepts : [];
    const userStrengths = Array.isArray(userSynthesis?.strengths) ? userSynthesis.strengths : [];
    const userWeaknesses = Array.isArray(userSynthesis?.weaknesses) ? userSynthesis.weaknesses : [];
    const userBlindSpots = Array.isArray(userSynthesis?.blindSpots) ? userSynthesis.blindSpots : [];

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
    
    if (!result || !result.response) {
      console.error(`[LookAlike] Invalid response from Gemini API`);
      return getDefaultLookAlikeResponse(nonOriginalGame);
    }
    
    const response = await result.response;
    const responseText = response?.text?.() || "";
    
    if (!responseText || typeof responseText !== "string" || responseText.trim().length === 0) {
      console.warn(`[LookAlike] Empty response from Gemini API`);
      return getDefaultLookAlikeResponse(nonOriginalGame);
    }
    
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
      
      // Validate parsed response structure
      return {
        isValidLookAlike: parsedResponse?.isValidLookAlike === true,
        thematicMatch: typeof parsedResponse?.thematicMatch === "string" ? parsedResponse.thematicMatch : "",
        matchedOriginalGameIds: Array.isArray(parsedResponse?.matchedOriginalGameIds)
          ? parsedResponse.matchedOriginalGameIds.filter((id) => typeof id === "string" && id.length > 0)
          : [],
        updatedAnalysis: typeof parsedResponse?.updatedAnalysis === "string" && parsedResponse.updatedAnalysis.length > 0
          ? parsedResponse.updatedAnalysis
          : (nonOriginalAnalysis.finalAnalysis || ""),
        thematicConnections: typeof parsedResponse?.thematicConnections === "string" ? parsedResponse.thematicConnections : "",
      };
    } catch (parseError) {
      console.error(`[LookAlike] Failed to parse Gemini response for game ${nonOriginalGame.gameId}:`, parseError);
      // If parsing fails, default to not a look-alike
      return getDefaultLookAlikeResponse(nonOriginalGame);
    }
  } catch (error) {
    console.error(`[LookAlike] Error analyzing look-alike game ${nonOriginalGame?.gameId}:`, error);
    return getDefaultLookAlikeResponse(nonOriginalGame);
  }
}

// Helper function to return default look-alike response
function getDefaultLookAlikeResponse(nonOriginalGame: any) {
  const nonOriginalAnalysis = nonOriginalGame?.analysis || {};
  return {
    isValidLookAlike: false,
    thematicMatch: "Unable to analyze game due to missing data or API error",
    matchedOriginalGameIds: [],
    updatedAnalysis: nonOriginalAnalysis.finalAnalysis || "",
    thematicConnections: "",
  };
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
  
  // Defensive checks
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    console.error(`[LookAlike] Invalid username in updateGameWithLookAlike: ${username}`);
    return { success: false, gameId, error: "Invalid username" };
  }
  
  if (!gameId || typeof gameId !== "string" || gameId.trim().length === 0) {
    console.error(`[LookAlike] Invalid gameId in updateGameWithLookAlike: ${gameId}`);
    return { success: false, gameId: gameId || "unknown", error: "Invalid gameId" };
  }
  
  if (!lookAlikeAnalysis || typeof lookAlikeAnalysis !== "object") {
    console.error(`[LookAlike] Invalid lookAlikeAnalysis provided`);
    return { success: false, gameId, error: "Invalid analysis data" };
  }
  
  try {
    const collection = await getGameAnalysisCollection();
    const now = new Date();
    
    // Build update object with validation
    const updateFields: any = {
      "analysis.isValidLookAlike": Boolean(lookAlikeAnalysis.isValidLookAlike),
      "analysis.thematicMatch": typeof lookAlikeAnalysis.thematicMatch === "string" ? lookAlikeAnalysis.thematicMatch : "",
      "analysis.matchedOriginalGameIds": Array.isArray(lookAlikeAnalysis.matchedOriginalGameIds)
        ? lookAlikeAnalysis.matchedOriginalGameIds.filter((id) => typeof id === "string" && id.length > 0)
        : [],
      "analysis.thematicConnections": typeof lookAlikeAnalysis.thematicConnections === "string" ? lookAlikeAnalysis.thematicConnections : "",
      updatedAt: now,
    };
    
    // Only update finalAnalysis if it's a valid look-alike and we have updated analysis
    if (lookAlikeAnalysis.isValidLookAlike && lookAlikeAnalysis.updatedAnalysis && typeof lookAlikeAnalysis.updatedAnalysis === "string" && lookAlikeAnalysis.updatedAnalysis.length > 0) {
      updateFields["analysis.finalAnalysis"] = lookAlikeAnalysis.updatedAnalysis;
    }
    
    const updateResult = await collection.updateOne(
      { gameId: gameId.trim(), username: username.toLowerCase().trim() },
      { $set: updateFields }
    );
    
    if (updateResult.matchedCount === 0) {
      console.warn(`[LookAlike] No game found to update: gameId=${gameId}, username=${username}`);
      return { success: false, gameId, error: "Game not found" };
    }
    
    return { success: true, gameId, isValidLookAlike: lookAlikeAnalysis.isValidLookAlike };
  } catch (error) {
    console.error(`[LookAlike] Error updating game ${gameId} for ${username}:`, error);
    return { success: false, gameId, error: error instanceof Error ? error.message : "Unknown error" };
  }
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
  
  // Step 2: Get synthesized user analysis (gracefully handle missing synthesis)
  const userSynthesis = await getUserSynthesis(username);
  
  if (!userSynthesis) {
    console.log(`[LookAlike] No synthesized analysis found for ${username}. Workflow will continue with limited user profile data.`);
    // Continue with empty synthesis - analyzeLookAlikeGame handles this defensively
  }
  
  // Step 3: Get original games (first 10)
  const originalGames = await getOriginalGames(username);
  
  if (!Array.isArray(originalGames) || originalGames.length < 10) {
    const count = Array.isArray(originalGames) ? originalGames.length : 0;
    console.log(`[LookAlike] Only ${count} original games found for ${username}, need 10`);
    return {
      success: false,
      reason: "insufficient_original_games",
      originalGamesFound: count,
      required: 10,
    };
  }
  
  // Step 4: Get non-original games that haven't been checked
  const nonOriginalGames = await getNonOriginalGames(username);
  
  if (!Array.isArray(nonOriginalGames) || nonOriginalGames.length === 0) {
    const count = Array.isArray(nonOriginalGames) ? nonOriginalGames.length : 0;
    console.log(`[LookAlike] No non-original games to process for ${username} (found ${count})`);
    return {
      success: true,
      gamesProcessed: 0,
      message: "No non-original games to check",
    };
  }
  
  console.log(`[LookAlike] Processing ${nonOriginalGames.length} non-original games for ${username}`);
  
  // Step 5: Process each non-original game with defensive error handling
  const results = [];
  for (const game of nonOriginalGames) {
    // Skip invalid games
    if (!game || !game.gameId) {
      console.warn(`[LookAlike] Skipping invalid game in processing loop`);
      results.push({
        gameId: game?.gameId || "unknown",
        success: false,
        error: "Invalid game data",
      });
      continue;
    }
    
    try {
      // Analyze if it's a look-alike
      const lookAlikeAnalysis = await analyzeLookAlikeGame(
        username,
        game,
        originalGames,
        userSynthesis || {} // Pass empty object if synthesis is null
      );
      
      // Validate analysis result before updating
      if (!lookAlikeAnalysis || typeof lookAlikeAnalysis !== "object") {
        console.warn(`[LookAlike] Invalid analysis result for game ${game.gameId}`);
        results.push({
          gameId: game.gameId,
          success: false,
          error: "Invalid analysis result",
        });
        continue;
      }
      
      // Update game with look-alike information
      const updateResult = await updateGameWithLookAlike(
        username,
        game.gameId,
        lookAlikeAnalysis
      );
      
      if (updateResult.success) {
        results.push({
          gameId: game.gameId,
          isValidLookAlike: lookAlikeAnalysis.isValidLookAlike,
          success: true,
        });
        console.log(`[LookAlike] Processed game ${game.gameId} for ${username}: isValidLookAlike=${lookAlikeAnalysis.isValidLookAlike}`);
      } else {
        results.push({
          gameId: game.gameId,
          success: false,
          error: updateResult.error || "Update failed",
        });
        console.warn(`[LookAlike] Failed to update game ${game.gameId}: ${updateResult.error}`);
      }
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

