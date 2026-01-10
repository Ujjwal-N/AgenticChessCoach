import { NextRequest, NextResponse } from "next/server";
import { getUserAnalysisCollection } from "@/lib/mongodb";

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
    const collection = await getUserAnalysisCollection();
    
    const userAnalysis = await collection.findOne({
      username: username.toLowerCase(),
    });

    if (!userAnalysis) {
      return NextResponse.json({
        success: true,
        hasAnalysis: false,
        message: "No synthesized analysis available yet",
      });
    }

    return NextResponse.json({
      success: true,
      hasAnalysis: true,
      analysis: {
        overallStrengths: userAnalysis.strengths,
        recurringWeaknesses: userAnalysis.weaknesses,
        blindSpots: userAnalysis.blindSpots,
        learningAreas: userAnalysis.learningAreas,
        playingStyle: userAnalysis.detailedAnalysis,
        ratingAssessment: userAnalysis.averageRating
          ? `Average rating: ${userAnalysis.averageRating}`
          : undefined,
        keyInsights: userAnalysis.summaryAnalysis,
        gamesAnalyzed: userAnalysis.gamesAnalyzed,
        wins: userAnalysis.wins,
        losses: userAnalysis.losses,
        draws: userAnalysis.draws,
        commonOpenings: userAnalysis.commonOpenings,
        commonConcepts: userAnalysis.commonConcepts,
        synthesizedAt: userAnalysis.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching user analysis:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

