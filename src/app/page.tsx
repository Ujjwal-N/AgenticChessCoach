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
    isRepresentative?: boolean;
    original?: boolean;
    isValidLookAlike?: boolean;
    thematicMatch?: string;
    matchedOriginalGameIds?: string[];
    thematicConnections?: string;
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
  const currentPollingUsernameRef = useRef<string>(""); // Track which username we're polling for

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const pollUserAnalysis = async () => {
    const pollingUsername = currentPollingUsernameRef.current;
    if (!pollingUsername.trim()) return;

    try {
      console.log(`[Polling] Fetching user analysis for ${pollingUsername}...`);
      const response = await fetch(`/api/user-analysis?username=${encodeURIComponent(pollingUsername)}`);
      
      if (!response.ok) {
        console.error(`[Polling] Error response: ${response.status}`);
        return;
      }
      
      const data = await response.json().catch((err) => {
        console.error("[Polling] Failed to parse JSON:", err);
        return { success: false };
      });

      if (response.ok && data.success && data.hasAnalysis) {
        console.log(`[Polling] Received user analysis for ${pollingUsername}`);
        // Only update state if we're still polling for this username
        if (currentPollingUsernameRef.current === pollingUsername) {
          setUserAnalysis(data.analysis);
        }
      }
    } catch (err) {
      console.error("[Polling] Error fetching user analysis:", err);
    }
  };

  const pollGames = async () => {
    const pollingUsername = currentPollingUsernameRef.current;
    if (!pollingUsername.trim()) return;

    try {
      console.log(`[Polling] Fetching games for ${pollingUsername}...`);
      const response = await fetch(`/api/check-analysis?username=${encodeURIComponent(pollingUsername)}`);
      
      if (!response.ok) {
        console.error(`[Polling] Error response: ${response.status}`);
        return;
      }
      
      const data = await response.json().catch((err) => {
        console.error("[Polling] Failed to parse JSON:", err);
        return { success: false };
      });

      if (response.ok && data.success) {
        console.log(`[Polling] Received ${data.games?.length || 0} games, ${data.withAnalysis || 0} with analysis`);
        // Only update state if we're still polling for this username
        if (currentPollingUsernameRef.current === pollingUsername) {
          setGames(data.games || []);
          setWithAnalysis(data.withAnalysis || 0);

          // Stop polling if all games have analysis or if we've been polling for too long (5 minutes max)
          if (data.withAnalysis === data.count && data.count > 0) {
            console.log("[Polling] All games analyzed, stopping poll");
            setPolling(false);
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            currentPollingUsernameRef.current = "";
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
    currentPollingUsernameRef.current = ""; // Clear previous polling username

    try {
      console.log(`[API] Fetching games for ${username}...`);
      const response = await fetch(`/api/games?username=${encodeURIComponent(username)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch games" }));
        setError(errorData.error || `Failed to fetch games (${response.status})`);
        setLoading(false);
        return;
      }
      
      const data = await response.json().catch((err) => {
        console.error("[API] Failed to parse JSON:", err);
        setError("Invalid response from server");
        setLoading(false);
        return null;
      });
      
      if (!data) return;

      if (!response.ok) {
        setError(data.error || "Failed to fetch games");
        setLoading(false);
        return;
      }

      console.log(`[API] Workflows started for ${data.count} games`);
      
      if (!data.count || data.count === 0) {
        setError("No games found for this user");
        setLoading(false);
        return;
      }
      
      setGameCount(data.count);
      setLoading(false);
      setPolling(true);
      
      // Set the username we're polling for
      currentPollingUsernameRef.current = username.trim().toLowerCase();

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
    if (!milliseconds || isNaN(milliseconds)) return "N/A";
    const ms = typeof milliseconds === 'number' ? milliseconds : parseInt(String(milliseconds));
    if (isNaN(ms) || ms < 0) return "N/A";
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
      if (isNaN(dateObj.getTime())) return "N/A";
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

  const GameCard = ({ game, isLookAlike = false }: { game: Game; isLookAlike?: boolean }) => (
    <div
      className={`rounded-lg border ${
        isLookAlike
          ? "border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10"
          : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      } p-4`}
    >
      {isLookAlike && (
        <div className="mb-3 p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-400 dark:border-purple-600">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-purple-900 dark:text-purple-100 bg-purple-200 dark:bg-purple-800 px-3 py-1 rounded-full">
              🔍 Look-Alike Match
            </span>
          </div>
          {game.analysis?.thematicMatch && (
            <p className="text-sm text-purple-800 dark:text-purple-200 mb-3 leading-relaxed">
              {String(game.analysis.thematicMatch)}
            </p>
          )}
          {game.analysis?.matchedOriginalGameIds && game.analysis.matchedOriginalGameIds.length > 0 && (
            <div className="mt-3 p-2 rounded-lg bg-purple-200/60 dark:bg-purple-800/40 border border-purple-300 dark:border-purple-700">
              <span className="text-xs font-bold text-purple-900 dark:text-purple-100 mb-2 block">
                🎯 Matches Original Games:
              </span>
              <div className="flex flex-wrap gap-2 mt-2">
                {game.analysis.matchedOriginalGameIds.map((gameId, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 rounded-md text-xs font-mono font-bold bg-gradient-to-r from-purple-400 to-purple-500 dark:from-purple-600 dark:to-purple-700 text-white shadow-md hover:shadow-lg transition-shadow border-2 border-purple-600 dark:border-purple-500"
                  >
                    {String(gameId).substring(0, 8)}...
                  </span>
                ))}
              </div>
            </div>
          )}
          {game.analysis?.thematicConnections && (
            <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/40 dark:to-purple-800/40 border-2 border-purple-300 dark:border-purple-600">
              <p className="text-xs font-bold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-1">
                <span className="text-base">✨</span>
                <span>Shared Thematic Elements:</span>
              </p>
              <div className="text-sm text-purple-800 dark:text-purple-200 font-medium leading-relaxed">
                {String(game.analysis.thematicConnections)
                  .split(/[,;•\n]/)
                  .filter((item) => item.trim().length > 0)
                  .map((element, idx) => (
                    <span
                      key={idx}
                      className="inline-block mr-2 mb-1 px-2.5 py-1 rounded-md bg-purple-300/70 dark:bg-purple-700/70 text-purple-900 dark:text-purple-100 font-semibold border border-purple-400 dark:border-purple-600"
                    >
                      {element.trim()}
                    </span>
                  ))}
                {String(game.analysis.thematicConnections)
                  .split(/[,;•\n]/)
                  .filter((item) => item.trim().length > 0).length === 0 && (
                  <span className="text-purple-700 dark:text-purple-300 italic">
                    {String(game.analysis.thematicConnections)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
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
            {game.analysis?.original && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Original
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
  );

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
            onError={(e) => {
              // Fallback if image fails to load
              e.currentTarget.style.display = 'none';
            }}
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
          <div className="w-full mt-6">
            <div className="rounded-xl border-2 border-blue-400 dark:border-blue-600 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/30 dark:to-zinc-900 shadow-lg p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                    📊
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-black dark:text-zinc-50">
                      Player Profile Analysis
                    </h2>
                    {userAnalysis.gamesAnalyzed && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                        Based on {userAnalysis.gamesAnalyzed} games
                        {userAnalysis.wins !== undefined && userAnalysis.losses !== undefined && (
                          <span className="ml-2 font-semibold">
                            ({userAnalysis.wins}W / {userAnalysis.losses}L / {userAnalysis.draws || 0}D)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {userAnalysis.keyInsights && (
                <div className="mb-8 p-6 rounded-xl bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/30 border-2 border-blue-300 dark:border-blue-700 shadow-md">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">💡</span>
                    <h3 className="text-xl font-bold text-blue-900 dark:text-blue-100">Key Insights</h3>
                  </div>
                  <div className="prose prose-base max-w-none dark:prose-invert text-blue-900 dark:text-blue-100 leading-relaxed">
                    <ReactMarkdown>{String(userAnalysis.keyInsights || "")}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {userAnalysis.overallStrengths && userAnalysis.overallStrengths.length > 0 && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-2 border-green-300 dark:border-green-700 shadow-md">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">✅</span>
                      <h3 className="text-lg font-bold text-green-800 dark:text-green-300">Overall Strengths</h3>
                    </div>
                    <ul className="list-disc list-inside space-y-2 text-base text-green-900 dark:text-green-200 font-medium">
                      {userAnalysis.overallStrengths.map((strength, index) => (
                        <li key={index}>{String(strength || "")}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {userAnalysis.recurringWeaknesses && userAnalysis.recurringWeaknesses.length > 0 && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 border-2 border-red-300 dark:border-red-700 shadow-md">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">⚠️</span>
                      <h3 className="text-lg font-bold text-red-800 dark:text-red-300">Recurring Weaknesses</h3>
                    </div>
                    <ul className="list-disc list-inside space-y-2 text-base text-red-900 dark:text-red-200 font-medium">
                      {userAnalysis.recurringWeaknesses.map((weakness, index) => (
                        <li key={index}>{String(weakness || "")}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {userAnalysis.blindSpots && userAnalysis.blindSpots.length > 0 && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 border-2 border-orange-300 dark:border-orange-700 shadow-md">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">👁️</span>
                      <h3 className="text-lg font-bold text-orange-800 dark:text-orange-300">Blind Spots</h3>
                    </div>
                    <ul className="list-disc list-inside space-y-2 text-base text-orange-900 dark:text-orange-200 font-medium">
                      {userAnalysis.blindSpots.map((spot, index) => (
                        <li key={index}>{String(spot || "")}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {userAnalysis.learningAreas && userAnalysis.learningAreas.length > 0 && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 border-2 border-purple-300 dark:border-purple-700 shadow-md">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">🎯</span>
                      <h3 className="text-lg font-bold text-purple-800 dark:text-purple-300">Learning Priorities</h3>
                    </div>
                    <ul className="list-disc list-inside space-y-2 text-base text-purple-900 dark:text-purple-200 font-medium">
                      {userAnalysis.learningAreas.map((area, index) => (
                        <li key={index}>{String(area || "")}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {userAnalysis.commonOpenings && userAnalysis.commonOpenings.length > 0 && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 border-2 border-purple-300 dark:border-purple-700 shadow-md">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">♟️</span>
                      <h3 className="text-lg font-bold text-purple-800 dark:text-purple-300">Common Openings</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {userAnalysis.commonOpenings.map((opening, index) => (
                        <span
                          key={index}
                          className="px-4 py-2 rounded-lg text-sm font-bold bg-purple-200 text-purple-900 dark:bg-purple-800 dark:text-purple-200 border-2 border-purple-400 dark:border-purple-600 shadow-sm"
                        >
                          {String(opening || "")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {userAnalysis.commonConcepts && userAnalysis.commonConcepts.length > 0 && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-2 border-blue-300 dark:border-blue-700 shadow-md">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">🧩</span>
                      <h3 className="text-lg font-bold text-blue-800 dark:text-blue-300">Common Concepts</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {userAnalysis.commonConcepts.map((concept, index) => (
                        <span
                          key={index}
                          className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-200 border-2 border-blue-400 dark:border-blue-600 shadow-sm"
                        >
                          {String(concept || "")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {userAnalysis.ratingAssessment && (
                <div className="mt-6 pt-6 border-t-2 border-zinc-300 dark:border-zinc-700">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📈</span>
                    <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">Rating Assessment</h3>
                  </div>
                  <p className="text-base text-zinc-700 dark:text-zinc-300 font-medium">
                    {String(userAnalysis.ratingAssessment || "")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {games.length > 0 && (() => {
          // Separate games into categories
          const originalGames = games.filter((g) => g.analysis?.original === true);
          const lookAlikeGames = games.filter((g) => g.analysis?.isValidLookAlike === true);
          const regularGames = games.filter(
            (g) => g.analysis?.original !== true && g.analysis?.isValidLookAlike !== true
          );

          return (
            <div className="w-full mt-4 space-y-6">
              {/* Original Games Section */}
              {originalGames.length > 0 && (
                <div>
                  <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-2">
                    Original Games ({originalGames.length})
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                    The first 10 games analyzed, forming the baseline for pattern recognition
                  </p>
                  <div className="space-y-4">
                    {originalGames.map((game) => (
                      <GameCard key={game.id || game.gameId} game={game} />
                    ))}
                  </div>
                </div>
              )}

              {/* Look-Alike Games Section */}
              {lookAlikeGames.length > 0 && (
                <div>
                  <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-2">
                    Look-Alike Games ({lookAlikeGames.length})
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                    Games that display thematic elements similar to your original games
                  </p>
                  <div className="space-y-4">
                    {lookAlikeGames.map((game) => (
                      <GameCard key={game.id || game.gameId} game={game} isLookAlike={true} />
                    ))}
                  </div>
                </div>
              )}

              {/* Regular Games Section */}
              {regularGames.length > 0 && (
                <div>
                  <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-2">
                    Other Games ({regularGames.length})
                  </h2>
                  <div className="space-y-4">
                    {regularGames.map((game) => (
                      <GameCard key={game.id || game.gameId} game={game} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </main>
    </div>
  );
}
