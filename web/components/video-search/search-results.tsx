"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  text: string;
  startTime: number;
  endTime: number;
  source: string;
  score: number;
  videoId: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SearchResults({ results, onSeek }: SearchResultsProps) {
  if (results.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        検索結果 ({results.length}件)
      </h3>
      {results.map((result, i) => (
        <Card
          key={`${result.videoId}-${result.startTime}-${i}`}
          className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => onSeek(result.startTime)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed line-clamp-3">
                {result.text}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  {formatTime(result.startTime)} - {formatTime(result.endTime)}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {result.source}
                </Badge>
              </div>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {(result.score * 100).toFixed(1)}%
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
