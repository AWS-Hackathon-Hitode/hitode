import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function POST(req: Request) {
  const { filename, contentType, kind } = (await req.json()) as {
    filename: string;
    contentType: string;
    kind?: "document" | "raw-image";
  };

  // 許可するMIME（PDFと画像）
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
  if (!allowed.has(contentType)) {
    return NextResponse.json({ error: "Unsupported contentType" }, { status: 400 });
  }

  const region = process.env.AWS_REGION ?? "us-east-1";

  
  const bucket = process.env.UPLOAD_BUCKET;
  const basePrefix = process.env.UPLOAD_PREFIX ?? "documents";
  if (!bucket) {
    return NextResponse.json({ error: "UPLOAD_BUCKET is missing" }, { status: 500 });
  }

  const safe = sanitizeFilename(filename);
  const id = crypto.randomBytes(8).toString("hex");
  const prefix = kind === "raw-image" ? "raw-images" : basePrefix;
  const key = `${prefix}/${Date.now()}-${id}-${safe}`;

  const s3 = new S3Client({ region });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });

  return NextResponse.json({ uploadUrl, bucket, key });
}