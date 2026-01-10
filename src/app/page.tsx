"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

interface Game {
  id: string;
  gameId: string;
  rated: boolean;
  variant: string;
  speed: string;
  perf: string;
  createdAt: number | string | Date;
  lastMoveAt: number | string | Date;
  status: string;
  players: {
    white?: { user?: { name: string } };
    black?: { user?: { name: string } };
  };
  winner?: string;
  opening?: { name: string };
  // Computed fields from API
  userColor?: "white" | "black";
  opponentRating?: number;
  ratingDiff?: number;
  duration?: number;
  result?: "win" | "loss" | "draw";
  analysis?: {
    finalAnalysis?: string;
    detailedAnalysis?: string;
    opening?: string;
    concepts?: string[];
    analyzedAt?: string | Date;
  } | null;
}

interface UserAnalysis {
  overallStrengths?: string[];
  recurringWeaknesses?: string[];
  blindSpots?: string[];
  learningAreas?: string[];
  playingStyle?: string;
  ratingAssessment?: string;
  keyInsights?: string;
  gamesAnalyzed?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  commonOpenings?: string[];
  commonConcepts?: string[];
  synthesizedAt?: string | Date;
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [userAnalysis, setUserAnalysis] = useState<UserAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [gameCount, setGameCount] = useState<number | null>(null);
  const [withAnalysis, setWithAnalysis] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const pollUserAnalysis = async () => {
    if (!username.trim()) return;

    try {
      console.log(`[Polling] Fetching user analysis for ${username}...`);
      const response = await fetch(`/api/user-analysis?username=${encodeURIComponent(username)}`);
      const data = await response.json();

      if (response.ok && data.success && data.hasAnalysis) {
        console.log(`[Polling] Received user analysis for ${username}`);
        setUserAnalysis(data.analysis);
      }
    } catch (err) {
      console.error("[Polling] Error fetching user analysis:", err);
    }
  };

  const pollGames = async () => {
    if (!username.trim()) return;

    try {
      console.log(`[Polling] Fetching games for ${username}...`);
      const response = await fetch(`/api/check-analysis?username=${encodeURIComponent(username)}`);
      const data = await response.json();

      if (response.ok && data.success) {
        console.log(`[Polling] Received ${data.games?.length || 0} games, ${data.withAnalysis || 0} with analysis`);
        setGames(data.games || []);
        setWithAnalysis(data.withAnalysis || 0);

        // Stop polling if all games have analysis
        if (data.withAnalysis === data.count && data.count > 0) {
          console.log("[Polling] All games analyzed, stopping poll");
          setPolling(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      }
    } catch (err) {
      console.error("[Polling] Error:", err);
    }
  };

  const fetchGames = async () => {
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    setLoading(true);
    setError(null);
    setGames([]);
    setUserAnalysis(null);
    setGameCount(null);
    setWithAnalysis(0);

    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    try {
      console.log(`[API] Fetching games for ${username}...`);
      const response = await fetch(`/api/games?username=${encodeURIComponent(username)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch games");
        setLoading(false);
        return;
      }

      console.log(`[API] Workflows started for ${data.count} games`);
      setGameCount(data.count);
      setLoading(false);
      setPolling(true);

      // Start polling immediately, then every 5 seconds
      pollGames();
      pollUserAnalysis();
      pollingIntervalRef.current = setInterval(() => {
        pollGames();
        pollUserAnalysis();
      }, 5000);
    } catch (err) {
      setError("An error occurred while fetching games");
      console.error(err);
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGames();
  };

  const formatDuration = (milliseconds: number | undefined): string => {
    if (!milliseconds) return "N/A";
    const ms = typeof milliseconds === 'number' ? milliseconds : parseInt(String(milliseconds));
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  const formatDate = (date: number | string | Date | undefined): string => {
    if (!date) return "N/A";
    try {
      const dateObj = typeof date === 'number' ? new Date(date) : new Date(date);
      return dateObj.toLocaleDateString();
    } catch {
      return "N/A";
    }
  };

  const getResultBadgeColor = (result: string | undefined): string => {
    switch (result) {
      case "win":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "loss":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case "draw":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-6 px-16 py-8 w-full max-w-4xl">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Enter Your Lichess Username
        </h1>
        <form onSubmit={handleSubmit} className="flex w-full max-w-md items-center gap-3">
          <Image
            src="https://upload.wikimedia.org/wikipedia/commons/4/47/Lichess_logo_2019.png"
            alt="Lichess logo"
            width={32}
            height={32}
            className="flex-shrink-0"
          />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Lichess username"
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-lg text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-500 px-6 py-3 text-lg font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            {loading ? "Loading..." : "Fetch"}
          </button>
        </form>

        {error && (
          <div className="w-full max-w-md rounded-lg bg-red-100 border border-red-300 px-4 py-3 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            {error}
          </div>
        )}

        {(loading || polling) && gameCount !== null && (
          <div className="w-full max-w-md rounded-lg bg-blue-50 border border-blue-200 px-6 py-4 dark:bg-blue-900/20 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 dark:border-blue-400"></div>
              <div className="flex-1">
                <div className="font-medium text-blue-900 dark:text-blue-100">
                  {loading ? "Starting analysis..." : "Analyzing games..."}
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  {withAnalysis > 0 ? (
                    <>Analyzed {withAnalysis} of {gameCount} games</>
                  ) : (
                    <>Processing {gameCount} games...</>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {userAnalysis && (
          <div className="w-full mt-4">
            <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">
                  Player Profile Analysis
                </h2>
                {userAnalysis.gamesAnalyzed && (
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Based on {userAnalysis.gamesAnalyzed} games
                    {userAnalysis.wins !== undefined && userAnalysis.losses !== undefined && (
                      <span className="ml-2">
                        ({userAnalysis.wins}W / {userAnalysis.losses}L / {userAnalysis.draws || 0}D)
                      </span>
                    )}
                  </span>
                )}
              </div>

              {userAnalysis.keyInsights && (
                <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Key Insights</h3>
                  <div className="prose prose-sm max-w-none dark:prose-invert text-blue-800 dark:text-blue-200">
                    <ReactMarkdown>{String(userAnalysis.keyInsights || "")}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {userAnalysis.overallStrengths && userAnalysis.overallStrengths.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-green-700 dark:text-green-400 mb-2">Overall Strengths</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {userAnalysis.overallStrengths.map((strength, index) => (
                        <li key={index}>{String(strength || "")}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {userAnalysis.recurringWeaknesses && userAnalysis.recurringWeaknesses.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">Recurring Weaknesses</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {userAnalysis.recurringWeaknesses.map((weakness, index) => (
                        <li key={index}>{String(weakness || "")}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {userAnalysis.blindSpots && userAnalysis.blindSpots.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-orange-700 dark:text-orange-400 mb-2">Blind Spots</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {userAnalysis.blindSpots.map((spot, index) => (
                        <li key={index}>{String(spot || "")}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {userAnalysis.learningAreas && userAnalysis.learningAreas.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-purple-700 dark:text-purple-400 mb-2">Learning Priorities</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {userAnalysis.learningAreas.map((area, index) => (
                        <li key={index}>{String(area || "")}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {userAnalysis.commonOpenings && userAnalysis.commonOpenings.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Common Openings</h3>
                  <div className="flex flex-wrap gap-2">
                    {userAnalysis.commonOpenings.map((opening, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                      >
                        {String(opening || "")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {userAnalysis.commonConcepts && userAnalysis.commonConcepts.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Common Concepts</h3>
                  <div className="flex flex-wrap gap-2">
                    {userAnalysis.commonConcepts.map((concept, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                      >
                        {String(concept || "")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {userAnalysis.ratingAssessment && (
                <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    <strong>Rating Assessment:</strong> {String(userAnalysis.ratingAssessment || "")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {games.length > 0 && (
          <div className="w-full mt-4">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
              Games ({games.length})
            </h2>
            <div className="space-y-4">
              {games.map((game) => (
                <div
                  key={game.id || game.gameId}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {game.result && (
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${getResultBadgeColor(
                              game.result
                            )}`}
                          >
                            {game.result.toUpperCase()}
                          </span>
                        )}
                        <div className="font-medium text-black dark:text-zinc-50">
                          {game.players.white?.user?.name || "Anonymous"} vs{" "}
                          {game.players.black?.user?.name || "Anonymous"}
                        </div>
                      </div>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">
                        {game.speed}
                        {game.duration !== undefined && ` • ${formatDuration(game.duration)}`}
                      </div>
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      {formatDate(game.createdAt)}
                    </div>
                  </div>

                  {game.analysis && (
                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                          ✓ Analyzed
                        </span>
                        {game.analysis.opening && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Opening:</span>
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              {String(game.analysis.opening || "")}
                            </span>
                          </div>
                        )}
                      </div>
                      {game.analysis.concepts && game.analysis.concepts.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {game.analysis.concepts.map((concept, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                            >
                              {String(concept || "")}
                            </span>
                          ))}
                        </div>
                      )}
                      {game.analysis.finalAnalysis && (
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                          <div className="prose prose-sm max-w-none dark:prose-invert text-zinc-700 dark:text-zinc-300">
                            <ReactMarkdown>{String(game.analysis.finalAnalysis || "")}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
