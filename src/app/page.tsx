"use client";

import { useState } from "react";
import Image from "next/image";

interface Game {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  perf: string;
  createdAt: number;
  lastMoveAt: number;
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
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = async () => {
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    setLoading(true);
    setError(null);
    setGames([]);

    try {
      const response = await fetch(`/api/games?username=${encodeURIComponent(username)}`);
      const data = await response.json();

      console.log(data);

      if (!response.ok) {
        setError(data.error || "Failed to fetch games");
        return;
      }

      setGames(data.games || []);
    } catch (err) {
      setError("An error occurred while fetching games");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGames();
  };

  const formatDuration = (milliseconds: number | undefined): string => {
    if (!milliseconds) return "N/A";
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
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

        {games.length > 0 && (
          <div className="w-full mt-4">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
              Games ({games.length})
            </h2>
            <div className="space-y-3">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4"
                >
                  <div className="flex justify-between items-start">
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
                      {new Date(game.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
