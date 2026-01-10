import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGameAnalysisCollection, getUserAnalysisCollection } from "@/lib/mongodb";
import { FatalError } from "workflow";

interface SynthesizeUserAnalysisInput {
  username: string;
}

// Step: Check if user has games with analysis and if count is a multiple of 3
export async function checkGamesWithAnalysis(username: string) {
  "use step";
  
  const collection = await getGameAnalysisCollection();
  const gamesWithAnalysis = await collection
    .find({
      username: username.toLowerCase(),
      "analysis.finalAnalysis": { $exists: true, $ne: null },
    })
    .toArray();
  
  const count = gamesWithAnalysis.length;
  const isMultipleOfThree = count >= 3 && count % 3 === 0;
  
  return {
    count,
    games: gamesWithAnalysis,
    isMultipleOfThree,
  };
}

// Step: Synthesize user analysis with Gemini
export async function synthesizeUserAnalysisWithGemini(
  username: string,
  games: any[]
) {
  "use step";
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new FatalError("GEMINI_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Prepare game summaries for synthesis
  const gameSummaries = games.map((game, index) => {
    const analysis = game.analysis || {};
    return {
      gameNumber: index + 1,
      result: game.result,
      opening: analysis.opening || "Unknown",
      concepts: analysis.concepts || [],
      analysis: analysis.finalAnalysis || analysis.detailedAnalysis || "",
      speed: game.speed,
      opponentRating: game.opponentRating,
    };
  });

  const prompt = `You are analyzing chess games for the player **${username}**. I'm providing you with analyses from ${games.length} of their games.

**Game Analyses:**

${gameSummaries.map((g, i) => `
**Game ${g.gameNumber}:**
- Result: ${g.result}
- Opening: ${g.opening}
- Speed: ${g.speed}
- Opponent Rating: ${g.opponentRating || "Unknown"}
- Concepts: ${g.concepts.join(", ") || "None"}
- Analysis: ${g.analysis}
`).join("\n---\n")}

**Your task:**

Synthesize these individual game analyses into a comprehensive player profile for **${username}**. Identify:

1. **Overall Strengths**: What does ${username} consistently do well across multiple games?
2. **Recurring Weaknesses**: What patterns of mistakes or weaknesses appear across multiple games?
3. **Blind Spots**: What tactical or positional patterns does ${username} consistently miss?
4. **Learning Priorities**: Based on the patterns across all games, what should ${username} focus on improving first?
5. **Playing Style**: What can you infer about ${username}'s playing style, preferences, and tendencies?
6. **Rating Assessment**: Based on the quality of play and mistakes, what rating range does ${username} appear to be playing at?

**CRITICAL:** You must respond with ONLY valid JSON. No markdown code blocks, no explanations, just pure JSON.

Output format (JSON only):

{
  "overallStrengths": "A comprehensive list of ${username}'s consistent strengths across multiple games. Be specific and reference patterns from the analyses.",
  "recurringWeaknesses": "A detailed list of weaknesses and mistakes that appear repeatedly across multiple games. Be specific about what types of errors ${username} makes consistently.",
  "blindSpots": "Patterns, threats, or tactical/positional concepts that ${username} consistently misses across multiple games.",
  "learningPriorities": "A prioritized list of what ${username} should focus on improving, ordered by importance and impact. Be specific and actionable.",
  "playingStyle": "A description of ${username}'s playing style, preferences, and tendencies based on the games analyzed.",
  "ratingAssessment": "An assessment of ${username}'s approximate rating level based on the quality of play observed.",
  "keyInsights": "3-5 key insights or takeaways that summarize the most important findings about ${username}'s chess game."
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
      overallStrengths: parsedResponse.overallStrengths || "",
      recurringWeaknesses: parsedResponse.recurringWeaknesses || "",
      blindSpots: parsedResponse.blindSpots || "",
      learningPriorities: parsedResponse.learningPriorities || "",
      playingStyle: parsedResponse.playingStyle || "",
      ratingAssessment: parsedResponse.ratingAssessment || "",
      keyInsights: parsedResponse.keyInsights || "",
    };
  } catch (parseError) {
    // If parsing fails, return a basic structure
    return {
      overallStrengths: "",
      recurringWeaknesses: "",
      blindSpots: "",
      learningPriorities: "",
      playingStyle: "",
      ratingAssessment: "",
      keyInsights: responseText.substring(0, 500), // Use first 500 chars as fallback
    };
  }
}

// Step: Save synthesized analysis to MongoDB
export async function saveUserAnalysisToMongoDB(
  username: string,
  synthesis: {
    overallStrengths: string;
    recurringWeaknesses: string;
    blindSpots: string;
    learningPriorities: string;
    playingStyle: string;
    ratingAssessment: string;
    keyInsights: string;
  },
  gamesAnalyzed: number,
  games: any[]
) {
  "use step";
  
  const collection = await getUserAnalysisCollection();
  const now = new Date();
  
  // Calculate statistics from games
  const wins = games.filter((g) => g.result === "win").length;
  const losses = games.filter((g) => g.result === "loss").length;
  const draws = games.filter((g) => g.result === "draw").length;
  const ratings = games.map((g) => g.userRating).filter((r) => r !== undefined) as number[];
  const averageRating = ratings.length > 0 
    ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
    : undefined;
  const ratingRange = ratings.length > 0
    ? { min: Math.min(...ratings), max: Math.max(...ratings) }
    : undefined;
  
  // Extract common openings and concepts
  const openings = games
    .map((g) => g.analysis?.opening)
    .filter((o) => o) as string[];
  const allConcepts = games
    .flatMap((g) => g.analysis?.concepts || [])
    .filter((c) => c) as string[];
  
  // Count concept frequency
  const conceptCounts: Record<string, number> = {};
  allConcepts.forEach((concept) => {
    conceptCounts[concept] = (conceptCounts[concept] || 0) + 1;
  });
  const commonConcepts = Object.entries(conceptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([concept]) => concept);
  
  // Count opening frequency
  const openingCounts: Record<string, number> = {};
  openings.forEach((opening) => {
    openingCounts[opening] = (openingCounts[opening] || 0) + 1;
  });
  const commonOpenings = Object.entries(openingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([opening]) => opening);
  
  // Helper function to safely parse string or array into array
  const parseToArray = (value: string | string[] | undefined | null, fallback: string = ""): string[] => {
    if (!value) return fallback ? [fallback] : [];
    if (Array.isArray(value)) return value.filter((s) => s && s.trim().length > 0).slice(0, 10);
    if (typeof value === "string") {
      return value
        .split(/[•\n-]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 10);
    }
    return fallback ? [fallback] : [];
  };

  // Parse strengths and weaknesses into arrays (split by sentences or bullets)
  const strengths = parseToArray(synthesis.overallStrengths, synthesis.overallStrengths);
  const weaknesses = parseToArray(synthesis.recurringWeaknesses, synthesis.recurringWeaknesses);
  const blindSpotsArray = parseToArray(synthesis.blindSpots, synthesis.blindSpots);
  const learningAreas = parseToArray(synthesis.learningPriorities, synthesis.learningPriorities);
  
  const userAnalysisDoc = {
    username: username.toLowerCase(),
    detailedAnalysis: `${synthesis.overallStrengths || ""}\n\n${synthesis.recurringWeaknesses || ""}\n\n${synthesis.blindSpots || ""}\n\n${synthesis.learningPriorities || ""}\n\n${synthesis.playingStyle || ""}\n\n${synthesis.ratingAssessment || ""}`,
    summaryAnalysis: synthesis.keyInsights || "",
    strengths: strengths.length > 0 ? strengths : (synthesis.overallStrengths ? [synthesis.overallStrengths] : []),
    weaknesses: weaknesses.length > 0 ? weaknesses : (synthesis.recurringWeaknesses ? [synthesis.recurringWeaknesses] : []),
    blindSpots: blindSpotsArray.length > 0 ? blindSpotsArray : (synthesis.blindSpots ? [synthesis.blindSpots] : []),
    learningAreas: learningAreas.length > 0 ? learningAreas : (synthesis.learningPriorities ? [synthesis.learningPriorities] : []),
    commonOpenings: commonOpenings.length > 0 ? commonOpenings : undefined,
    commonConcepts: commonConcepts.length > 0 ? commonConcepts : undefined,
    gamesAnalyzed: gamesAnalyzed,
    gameIds: games.map((g) => g.gameId),
    wins: wins,
    losses: losses,
    draws: draws,
    averageRating: averageRating,
    ratingRange: ratingRange,
    updatedAt: now,
    lastGameAnalyzedAt: now,
  };
  
  await collection.updateOne(
    { username: username.toLowerCase() },
    { 
      $set: userAnalysisDoc,
      $setOnInsert: {
        createdAt: now,
      }
    },
    { upsert: true }
  );
  
  return { success: true, username: username.toLowerCase() };
}

// Workflow: Synthesize user analysis from all analyzed games
export async function synthesizeUserAnalysisWorkflow(input: SynthesizeUserAnalysisInput) {
  "use workflow";
  
  const { username } = input;
  
  // Step 1: Check if user has games with analysis and if count is a multiple of 3
  const { count, games, isMultipleOfThree } = await checkGamesWithAnalysis(username);
  
  // If less than 3 games or not a multiple of 3, gracefully exit
  if (count < 3) {
    console.log(`[Synthesis] Only ${count} games with analysis for ${username}, need at least 3. Exiting gracefully.`);
    return {
      success: false,
      reason: "insufficient_games",
      gamesWithAnalysis: count,
      required: 3,
    };
  }
  
  if (!isMultipleOfThree) {
    console.log(`[Synthesis] ${count} games with analysis for ${username}, but not a multiple of 3. Exiting gracefully.`);
    return {
      success: false,
      reason: "not_multiple_of_three",
      gamesWithAnalysis: count,
      message: `Need count to be a multiple of 3 (currently ${count})`,
    };
  }
  
  // Step 2: Synthesize with Gemini (with automatic retry)
  const synthesis = await synthesizeUserAnalysisWithGemini(username, games);
  
  // Step 3: Save to MongoDB (with automatic retry)
  await saveUserAnalysisToMongoDB(username, synthesis, count, games);
  
  return {
    success: true,
    username: username.toLowerCase(),
    gamesAnalyzed: count,
  };
}

