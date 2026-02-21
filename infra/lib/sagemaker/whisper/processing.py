"""
SageMaker Processing Job: 動画→音声抽出→Whisper文字起こし→キーフレーム抽出

入力: /opt/ml/processing/input/video.mp4
出力: /opt/ml/processing/output/
  - transcript.json  (Whisper文字起こし結果)
  - frames/           (キーフレーム画像)
"""

import json
import os
import subprocess
import sys
import glob
import re

import whisper


INPUT_DIR = "/opt/ml/processing/input"
OUTPUT_DIR = "/opt/ml/processing/output"
FRAMES_DIR = os.path.join(OUTPUT_DIR, "frames")
AUDIO_DIR = "/tmp/audio"

# Whisper APIの制限: 25MB
MAX_AUDIO_CHUNK_SIZE = 25 * 1024 * 1024


def find_video_file():
    """入力ディレクトリから動画ファイルを見つける"""
    video_extensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]
    for ext in video_extensions:
        files = glob.glob(os.path.join(INPUT_DIR, f"*{ext}"))
        if files:
            return files[0]
    # 拡張子関係なく最初のファイルを返す
    files = glob.glob(os.path.join(INPUT_DIR, "*"))
    if files:
        return files[0]
    raise FileNotFoundError(f"No video file found in {INPUT_DIR}")


def extract_audio(video_path: str) -> list[str]:
    """FFmpegで動画から音声を抽出。25MB超の場合は分割"""
    os.makedirs(AUDIO_DIR, exist_ok=True)

    # まず全体を1ファイルに抽出
    full_audio = os.path.join(AUDIO_DIR, "full.mp3")
    subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-vn", "-acodec", "libmp3lame", "-ab", "128k",
            "-ar", "16000", "-ac", "1",
            "-y", full_audio,
        ],
        check=True,
        capture_output=True,
    )

    file_size = os.path.getsize(full_audio)
    print(f"Audio extracted: {full_audio} ({file_size / 1024 / 1024:.1f} MB)")

    if file_size <= MAX_AUDIO_CHUNK_SIZE:
        return [full_audio]

    # 25MB超の場合、動画の長さを取得して分割
    duration = get_duration(video_path)
    num_chunks = (file_size // MAX_AUDIO_CHUNK_SIZE) + 1
    chunk_duration = duration / num_chunks

    audio_chunks = []
    for i in range(num_chunks):
        start = i * chunk_duration
        chunk_path = os.path.join(AUDIO_DIR, f"chunk_{i:03d}.mp3")
        subprocess.run(
            [
                "ffmpeg", "-i", full_audio,
                "-ss", str(start), "-t", str(chunk_duration),
                "-acodec", "libmp3lame", "-ab", "128k",
                "-y", chunk_path,
            ],
            check=True,
            capture_output=True,
        )
        audio_chunks.append(chunk_path)
        print(f"Audio chunk {i}: {chunk_path} ({os.path.getsize(chunk_path) / 1024 / 1024:.1f} MB)")

    return audio_chunks


def get_duration(file_path: str) -> float:
    """FFprobeで動画/音声の長さを取得"""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def transcribe(audio_chunks: list[str]) -> dict:
    """Whisperで音声を文字起こし"""
    model = whisper.load_model("large-v3")

    all_segments = []
    full_text_parts = []
    time_offset = 0.0

    for chunk_path in audio_chunks:
        print(f"Transcribing: {chunk_path}")
        result = model.transcribe(
            chunk_path,
            language="ja",
            verbose=False,
        )

        for seg in result["segments"]:
            all_segments.append({
                "start": round(seg["start"] + time_offset, 2),
                "end": round(seg["end"] + time_offset, 2),
                "text": seg["text"].strip(),
            })

        full_text_parts.append(result["text"].strip())

        # 次のチャンクのオフセット
        if len(audio_chunks) > 1:
            time_offset += get_duration(chunk_path)

    return {
        "fullText": " ".join(full_text_parts),
        "segments": all_segments,
    }


def extract_keyframes(video_path: str) -> list[dict]:
    """FFmpegでスライド変化を検出してキーフレーム抽出"""
    os.makedirs(FRAMES_DIR, exist_ok=True)

    # scene changeフィルタでキーフレーム抽出
    # showinfo で各フレームのタイムスタンプを取得
    result = subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-vf", "select='gt(scene,0.3)',showinfo",
            "-vsync", "vfr",
            "-frame_pts", "1",
            "-y", os.path.join(FRAMES_DIR, "frame_%04d.jpg"),
        ],
        capture_output=True,
        text=True,
    )

    # stderrからタイムスタンプを解析
    timestamps = []
    for line in result.stderr.split("\n"):
        if "pts_time:" in line:
            match = re.search(r"pts_time:\s*([\d.]+)", line)
            if match:
                timestamps.append(float(match.group(1)))

    # フレームファイルとタイムスタンプを紐付け
    frame_files = sorted(glob.glob(os.path.join(FRAMES_DIR, "frame_*.jpg")))
    frames = []
    for i, frame_path in enumerate(frame_files):
        timestamp = timestamps[i] if i < len(timestamps) else 0.0
        frame_name = os.path.basename(frame_path)
        frames.append({
            "frameFile": frame_name,
            "timestamp": round(timestamp, 2),
        })

    print(f"Extracted {len(frames)} keyframes")
    return frames


def main():
    print("=== Video Processing Start ===")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. 動画ファイルを見つける
    video_path = find_video_file()
    print(f"Video file: {video_path}")

    # 2. 音声抽出
    print("--- Extracting audio ---")
    audio_chunks = extract_audio(video_path)

    # 3. Whisper文字起こし
    print("--- Transcribing ---")
    transcript = transcribe(audio_chunks)
    print(f"Segments: {len(transcript['segments'])}")

    # 4. キーフレーム抽出
    print("--- Extracting keyframes ---")
    frames = extract_keyframes(video_path)

    # 5. 結果を保存
    output = {
        "transcript": transcript,
        "frames": frames,
    }

    output_path = os.path.join(OUTPUT_DIR, "transcript.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Output saved to {output_path}")
    print(f"Frames saved to {FRAMES_DIR}/")
    print("=== Video Processing Complete ===")


if __name__ == "__main__":
    main()
