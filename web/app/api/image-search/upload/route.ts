import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
});

const BUCKET = process.env.IMAGE_SEARCH_BUCKET!;

export async function POST(req: Request) {
  const { filename, contentType } = (await req.json()) as {
    filename: string;
    contentType: string;
  };

  if (!filename || !contentType) {
    return NextResponse.json(
      { error: "filename and contentType are required" },
      { status: 400 },
    );
  }

  const imageId = randomUUID();
  const key = `raw-images/${imageId}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  return NextResponse.json({ imageId, presignedUrl, key });
}
