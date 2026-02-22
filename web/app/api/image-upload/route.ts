import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

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

  const missingEnvs = [
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "RAW_IMAGE_BUCKET",
  ].filter((key) => !process.env[key]);

  if (missingEnvs.length > 0) {
    const errorMessage = `Missing environment variables: ${missingEnvs.join(
      ", ",
    )}`;
    console.error(errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }

  const imageId = randomUUID();
  const key = `raw-images/${imageId}/${filename}`;

  try {
    const s3 = new S3Client({
      region: process.env.AWS_REGION!,
    });

    const BUCKET = process.env.RAW_IMAGE_BUCKET!;

    console.log("Using bucket:", BUCKET);

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return NextResponse.json({ imageId, presignedUrl, key });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Error creating presigned URL" },
      { status: 500 },
    );
  }
}
