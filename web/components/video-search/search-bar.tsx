"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchResult {
  text: string;
  startTime: number;
  endTime: number;
  source: string;
  score: number;
  videoId: string;
}

interface SearchBarProps {
  onResults: (results: SearchResult[]) => void;
  videoId?: string;
}

export function SearchBar({ onResults, videoId }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/video-search/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, videoId }),
      });
      const data = await res.json();
      onResults(data.results || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder="動画の内容を検索...（例: AIについて話しているところ）"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        className="flex-1"
      />
      <Button onClick={handleSearch} disabled={loading || !query.trim()}>
        {loading ? "検索中..." : "検索"}
      </Button>
    </div>
  );
}
