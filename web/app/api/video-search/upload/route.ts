import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-northeast-1",
});
const BUCKET = process.env.VIDEO_SEARCH_BUCKET!;

export async function POST(req: Request) {
  const { filename, contentType } = await req.json();

  const videoId = randomUUID();
  const key = `raw-videos/${videoId}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(s3, command, {
    expiresIn: 3600,
  });

  return NextResponse.json({
    videoId,
    presignedUrl,
    key,
  });
}
