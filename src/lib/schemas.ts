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
    isRepresentative?: boolean; // Whether this game is representative of the user's skill level
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
    isRepresentative?: boolean;
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

/**
 * MongoDB Schema for User Analysis
 * 
 * This schema represents synthesized analysis across multiple games for a user.
 * It aggregates insights from individual game analyses to provide a comprehensive
 * view of the user's chess playing patterns, strengths, and weaknesses.
 */
export interface UserAnalysisDocument {
  // User identifier
  username: string;
  
  // Synthesized Analysis
  detailedAnalysis?: string; // Comprehensive analysis synthesized from multiple games
  summaryAnalysis?: string; // Short summary of overall strengths/weaknesses
  
  // Aggregated Tags/Concepts
  tags?: string[]; // Aggregated chess concepts/tags from multiple games
  commonOpenings?: string[]; // Most frequently played openings
  commonConcepts?: string[]; // Most frequently encountered concepts
  
  // Game Statistics
  gamesAnalyzed?: number; // Number of games included in this analysis
  gameIds?: string[]; // IDs of games that contributed to this analysis
  wins?: number;
  losses?: number;
  draws?: number;
  
  // Rating Information
  averageRating?: number; // Average rating across analyzed games
  ratingRange?: {
    min?: number;
    max?: number;
  };
  
  // Time Control Preferences
  preferredSpeed?: string; // Most common speed (blitz, rapid, classical)
  preferredVariant?: string; // Most common variant
  
  // Strengths and Weaknesses (synthesized)
  strengths?: string[]; // Key strengths identified across games
  weaknesses?: string[]; // Key weaknesses identified across games
  blindSpots?: string[]; // Common blind spots or patterns missed
  
  // Learning Areas
  learningAreas?: string[]; // Areas for improvement identified
  
  // Metadata
  createdAt: Date; // When this analysis was first created
  updatedAt: Date; // When this analysis was last updated
  lastGameAnalyzedAt?: Date; // Timestamp of the most recent game analyzed
}

/**
 * Helper function to create a UserAnalysisDocument
 */
export function createUserAnalysisDocument(
  username: string,
  analysis: {
    detailedAnalysis?: string;
    summaryAnalysis?: string;
    tags?: string[];
    commonOpenings?: string[];
    commonConcepts?: string[];
    gamesAnalyzed?: number;
    gameIds?: string[];
    wins?: number;
    losses?: number;
    draws?: number;
    averageRating?: number;
    ratingRange?: { min?: number; max?: number };
    preferredSpeed?: string;
    preferredVariant?: string;
    strengths?: string[];
    weaknesses?: string[];
    blindSpots?: string[];
    learningAreas?: string[];
    lastGameAnalyzedAt?: Date;
  }
): UserAnalysisDocument {
  const now = new Date();
  
  return {
    username: username.toLowerCase(),
    detailedAnalysis: analysis.detailedAnalysis,
    summaryAnalysis: analysis.summaryAnalysis,
    tags: analysis.tags,
    commonOpenings: analysis.commonOpenings,
    commonConcepts: analysis.commonConcepts,
    gamesAnalyzed: analysis.gamesAnalyzed,
    gameIds: analysis.gameIds,
    wins: analysis.wins,
    losses: analysis.losses,
    draws: analysis.draws,
    averageRating: analysis.averageRating,
    ratingRange: analysis.ratingRange,
    preferredSpeed: analysis.preferredSpeed,
    preferredVariant: analysis.preferredVariant,
    strengths: analysis.strengths,
    weaknesses: analysis.weaknesses,
    blindSpots: analysis.blindSpots,
    learningAreas: analysis.learningAreas,
    createdAt: now,
    updatedAt: now,
    lastGameAnalyzedAt: analysis.lastGameAnalyzedAt,
  };
}

