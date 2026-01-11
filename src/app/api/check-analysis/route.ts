import { NextRequest, NextResponse } from "next/server";
import { getGameAnalysisCollection } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const username = searchParams.get("username");
  const gameId = searchParams.get("gameId");

  if (!username) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  try {
    const collection = await getGameAnalysisCollection();
    
    const query: any = { username: username.toLowerCase() };
    if (gameId) {
      query.gameId = gameId;
    }

    const documents = await collection
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();

    // Return full game data for frontend polling
    return NextResponse.json({
      success: true,
      games: documents.map((doc) => ({
        id: doc.gameId,
        gameId: doc.gameId,
        rated: doc.rated,
        variant: doc.variant,
        speed: doc.speed,
        perf: doc.perf,
        createdAt: doc.createdAt,
        lastMoveAt: doc.lastMoveAt,
        status: doc.status,
        winner: doc.winner,
        players: doc.players,
        opening: doc.opening,
        userColor: doc.userColor,
        userRating: doc.userRating,
        opponentRating: doc.opponentRating,
        ratingDiff: doc.ratingDiff,
        duration: doc.duration,
        result: doc.result,
        analysis: doc.analysis
          ? {
              finalAnalysis: doc.analysis.finalAnalysis,
              detailedAnalysis: doc.analysis.detailedAnalysis,
              opening: doc.analysis.opening,
              concepts: doc.analysis.concepts,
              isRepresentative: doc.analysis.isRepresentative,
              original: doc.analysis.original,
              isValidLookAlike: doc.analysis.isValidLookAlike,
              thematicMatch: doc.analysis.thematicMatch,
              matchedOriginalGameIds: doc.analysis.matchedOriginalGameIds,
              thematicConnections: doc.analysis.thematicConnections,
              analyzedAt: doc.analysis.analyzedAt,
            }
          : null,
        pgn: doc.pgn,
        storedAt: doc.storedAt,
        updatedAt: doc.updatedAt,
      })),
      count: documents.length,
      withAnalysis: documents.filter((doc) => doc.analysis).length,
      withoutAnalysis: documents.filter((doc) => !doc.analysis).length,
    });
  } catch (error) {
    console.error("Error checking analysis:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

