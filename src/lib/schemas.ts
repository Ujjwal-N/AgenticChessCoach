/**
 * MongoDB Schema for Game Analysis
 * 
 * This schema represents a chess game with optional AI analysis stored in MongoDB.
 */

export interface GameAnalysisDocument {
  // Unique identifier from Lichess
  gameId: string;
  
  // User information
  username: string;
  
  // Game metadata from Lichess
  rated: boolean;
  variant: string; // e.g., "standard", "chess960"
  speed: string; // e.g., "blitz", "rapid", "classical"
  perf: string; // Performance category
  
  // Timestamps (stored as Date objects in MongoDB)
  createdAt: Date; // When the game was created on Lichess
  lastMoveAt: Date; // When the last move was made
  
  // Game status
  status: string; // e.g., "mate", "resign", "draw", "timeout"
  winner?: string; // "white" | "black" | undefined
  
  // Players information
  players: {
    white?: {
      user?: {
        name: string;
        id: string;
      };
      rating?: number;
    };
    black?: {
      user?: {
        name: string;
        id: string;
      };
      rating?: number;
    };
  };
  
  // Opening information from Lichess
  opening?: {
    name: string;
  };
  
  // Computed fields
  userColor: "white" | "black";
  userRating?: number;
  opponentRating?: number;
  ratingDiff: number; // Absolute difference between user and opponent ratings
  duration: number; // Duration in milliseconds (lastMoveAt - createdAt)
  result: "win" | "loss" | "draw";
  
  // AI Analysis fields (all optional)
  analysis?: {
    finalAnalysis?: string; // Short summary analysis
    detailedAnalysis?: string; // Comprehensive analysis
    opening?: string; // Opening name from AI analysis (may differ from Lichess)
    concepts?: string[]; // Array of chess concepts/tags (max 5)
    analyzedAt?: Date; // When the analysis was performed
  };
  
  // PGN data (optional, can be stored if needed for future analysis)
  pgn?: string;
  
  // Metadata
  storedAt: Date; // When this document was stored in MongoDB
  updatedAt?: Date; // When this document was last updated
}

/**
 * Helper function to create a GameAnalysisDocument from processed game data
 */
export function createGameAnalysisDocument(
  game: any,
  username: string,
  analysis?: {
    finalAnalysis?: string;
    detailedAnalysis?: string;
    opening?: string;
    concepts?: string[];
  },
  pgn?: string
): GameAnalysisDocument {
  const now = new Date();
  
  return {
    gameId: game.id,
    username: username.toLowerCase(),
    rated: game.rated,
    variant: game.variant,
    speed: game.speed,
    perf: game.perf,
    createdAt: new Date(game.createdAt),
    lastMoveAt: new Date(game.lastMoveAt),
    status: game.status,
    winner: game.winner,
    players: game.players,
    opening: game.opening,
    userColor: game.userColor,
    userRating: game.userColor === "white" 
      ? game.players.white?.rating 
      : game.players.black?.rating,
    opponentRating: game.opponentRating,
    ratingDiff: game.ratingDiff ?? 0,
    duration: game.duration ?? 0,
    result: game.result,
    analysis: analysis ? {
      ...analysis,
      analyzedAt: now,
    } : undefined,
    pgn: pgn,
    storedAt: now,
  };
}

