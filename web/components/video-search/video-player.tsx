"use client";

import { useRef, useImperativeHandle, forwardRef } from "react";
import { Card } from "@/components/ui/card";

export interface VideoPlayerHandle {
  seekTo: (time: number) => void;
}

interface VideoPlayerProps {
  src: string | null;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ src }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => ({
      seekTo: (time: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = time;
          videoRef.current.play();
        }
      },
    }));

    if (!src) {
      return (
        <Card className="aspect-video flex items-center justify-center bg-muted">
          <p className="text-muted-foreground">
            動画をアップロードすると、ここに表示されます
          </p>
        </Card>
      );
    }

    return (
      <Card className="overflow-hidden">
        <video
          ref={videoRef}
          src={src}
          controls
          className="w-full aspect-video"
        />
      </Card>
    );
  },
);
