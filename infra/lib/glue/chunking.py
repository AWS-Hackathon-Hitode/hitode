"""
Glue Python Shell Job: 文字起こし+OCR結果をチャンク分割・統合

入力: S3 processed/{videoId}/transcript.json, ocr.json
出力: S3 chunked/{videoId}/chunks.json
"""

import json
import sys
import boto3

# Glue Job パラメータ
from awsglue.utils import getResolvedOptions

args = getResolvedOptions(sys.argv, ["BUCKET", "VIDEO_ID"])
BUCKET = args["BUCKET"]
VIDEO_ID = args["VIDEO_ID"]

s3 = boto3.client("s3")

CHUNK_DURATION_SEC = 45  # チャンク目標長（秒）


def read_s3_json(key: str) -> dict:
    obj = s3.get_object(Bucket=BUCKET, Key=key)
    return json.loads(obj["Body"].read().decode("utf-8"))


def write_s3_json(key: str, data):
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=json.dumps(data, ensure_ascii=False, indent=2),
        ContentType="application/json",
    )


def build_chunks(segments: list[dict], slides: list[dict]) -> list[dict]:
    """
    Whisperセグメントを時間ベースでチャンクにグループ化し、
    同一時間帯のスライドOCRテキストを統合する。
    """
    if not segments:
        return []

    # スライドをタイムスタンプ順にソート
    sorted_slides = sorted(slides, key=lambda s: s["timestamp"])

    chunks = []
    current_chunk_id = 0
    current_texts = []
    chunk_start = segments[0]["start"]

    for seg in segments:
        current_texts.append(seg["text"])

        # チャンク目標長に達したら確定
        if seg["end"] - chunk_start >= CHUNK_DURATION_SEC:
            chunk_end = seg["end"]
            audio_text = " ".join(current_texts)

            # 同一時間帯のスライドテキストを取得
            slide_texts = get_slide_texts(sorted_slides, chunk_start, chunk_end)

            # チャンクテキスト構築
            chunk_text = f"[音声] {audio_text}"
            if slide_texts:
                chunk_text += f" [スライド] {' / '.join(slide_texts)}"

            chunks.append({
                "id": current_chunk_id,
                "text": chunk_text,
                "startTime": round(chunk_start, 2),
                "endTime": round(chunk_end, 2),
                "source": "audio+slide" if slide_texts else "audio",
            })

            current_chunk_id += 1
            current_texts = []
            chunk_start = chunk_end

    # 残りのセグメントを最後のチャンクに
    if current_texts:
        chunk_end = segments[-1]["end"]
        audio_text = " ".join(current_texts)
        slide_texts = get_slide_texts(sorted_slides, chunk_start, chunk_end)

        chunk_text = f"[音声] {audio_text}"
        if slide_texts:
            chunk_text += f" [スライド] {' / '.join(slide_texts)}"

        chunks.append({
            "id": current_chunk_id,
            "text": chunk_text,
            "startTime": round(chunk_start, 2),
            "endTime": round(chunk_end, 2),
            "source": "audio+slide" if slide_texts else "audio",
        })

    return chunks


def get_slide_texts(
    sorted_slides: list[dict], start: float, end: float
) -> list[str]:
    """指定時間帯に含まれるスライドのテキストを返す"""
    texts = []
    for slide in sorted_slides:
        ts = slide["timestamp"]
        if start <= ts < end and slide.get("text"):
            texts.append(slide["text"])
    return texts


def main():
    print(f"=== Chunking Start: {VIDEO_ID} ===")

    # transcript.json 読み込み
    transcript_data = read_s3_json(f"processed/{VIDEO_ID}/transcript.json")
    segments = transcript_data.get("transcript", {}).get("segments", [])
    print(f"Segments: {len(segments)}")

    # ocr.json 読み込み（存在しない場合は空）
    slides = []
    try:
        ocr_data = read_s3_json(f"processed/{VIDEO_ID}/ocr.json")
        slides = ocr_data.get("slides", [])
        print(f"Slides: {len(slides)}")
    except s3.exceptions.NoSuchKey:
        print("No OCR data found, proceeding with audio only")
    except Exception as e:
        print(f"OCR data read error (proceeding without): {e}")

    # チャンク分割・統合
    chunks = build_chunks(segments, slides)
    print(f"Chunks created: {len(chunks)}")

    # 結果保存
    output = {
        "videoId": VIDEO_ID,
        "chunkCount": len(chunks),
        "chunks": chunks,
    }
    write_s3_json(f"chunked/{VIDEO_ID}/chunks.json", output)

    print(f"=== Chunking Complete: {len(chunks)} chunks ===")


if __name__ == "__main__":
    main()
