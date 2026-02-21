"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface VideoUploaderProps {
  onUploadComplete: (videoId: string) => void;
  onFileSelected?: (file: File) => void;
}

export function VideoUploader({ onUploadComplete, onFileSelected }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const handleUpload = useCallback(
    async (file: File) => {
      onFileSelected?.(file);
      setUploading(true);
      setProgress(0);
      setStatus("署名付きURL取得中...");

      // 1. Presigned URL を取得
      const res = await fetch("/api/video-search/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });
      const { videoId, presignedUrl } = await res.json();

      // 2. S3 に直接アップロード
      setStatus("アップロード中...");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("Upload error")));
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      setStatus("処理パイプライン開始（文字起こし→OCR→チャンキング→Embedding）");
      setProgress(100);
      onUploadComplete(videoId);
    },
    [onUploadComplete],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("video/")) {
        handleUpload(file);
      }
    },
    [handleUpload],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  return (
    <Card
      className={`p-8 border-2 border-dashed transition-colors ${
        isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-muted-foreground/25"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {uploading ? (
        <div className="space-y-3">
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-muted-foreground text-center">{status}</p>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            動画ファイルをドラッグ&ドロップ
          </p>
          <label>
            <Button variant="outline" asChild>
              <span>ファイルを選択</span>
            </Button>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        </div>
      )}
    </Card>
  );
}
