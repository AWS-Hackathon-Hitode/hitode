"use client";

import { useRef, useState } from "react";
import { VideoUploader } from "@/components/video-search/video-uploader";
import { SearchBar } from "@/components/video-search/search-bar";
import {
  SearchResults,
} from "@/components/video-search/search-results";
import {
  VideoPlayer,
  type VideoPlayerHandle,
} from "@/components/video-search/video-player";

interface SearchResult {
  text: string;
  startTime: number;
  endTime: number;
  source: string;
  score: number;
  videoId: string;
}

export default function VideoSearchPage() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const playerRef = useRef<VideoPlayerHandle>(null);

  const handleUploadComplete = (id: string) => {
    setVideoId(id);
  };

  const handleFileSelected = (file: File) => {
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
  };

  const handleSeek = (time: number) => {
    playerRef.current?.seekTo(time);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">Video Semantic Search</h1>
          <p className="text-sm text-muted-foreground">
            動画をアップロードして、内容を意味検索
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* 上段: 動画プレーヤー + アップロード */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <VideoPlayer ref={playerRef} src={videoSrc} />
          </div>
          <div>
            <VideoUploader
              onUploadComplete={handleUploadComplete}
              onFileSelected={handleFileSelected}
            />
            {videoId && (
              <div className="mt-4 p-3 rounded-md bg-muted text-sm">
                <p className="font-medium">処理中...</p>
                <p className="text-muted-foreground mt-1">
                  Video ID: {videoId}
                </p>
                <p className="text-muted-foreground">
                  文字起こし → OCR → チャンキング → Embedding の順に処理されます。
                  完了まで数分かかります。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 検索バー */}
        <SearchBar onResults={setResults} videoId={videoId ?? undefined} />

        {/* 検索結果 */}
        <SearchResults results={results} onSeek={handleSeek} />
      </main>
    </div>
  );
}
