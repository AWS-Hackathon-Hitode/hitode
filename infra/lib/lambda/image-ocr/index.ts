import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3Event } from "aws-lambda";

const bedrock = new BedrockRuntimeClient();
const s3 = new S3Client();

const RAW_BUCKET = process.env.RAW_BUCKET!;
const DATA_SOURCE_BUCKET = process.env.DATA_SOURCE_BUCKET!;
const VLM_MODEL_ID = process.env.VLM_MODEL_ID!;

const SUPPORTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
]);

export const handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    // key format: raw-images/{imageId}/{filename}
    const parts = key.split("/");
    if (parts.length < 3) {
      console.log(`Unexpected key format, skipping: ${key}`);
      continue;
    }

    const imageId = parts[1];
    const filename = parts[2];
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      console.log(`Unsupported extension, skipping: ${key}`);
      continue;
    }

    console.log(`Processing: ${imageId}/${filename}`);

    try {
      // 1. S3 から画像バイナリを取得
      const imageObj = await s3.send(
        new GetObjectCommand({ Bucket: RAW_BUCKET, Key: key }),
      );
      const imageBytes = await imageObj.Body!.transformToByteArray();
      const base64Image = Buffer.from(imageBytes).toString("base64");
      const mediaType = resolveMediaType(ext);

      // 2. Claude Vision で OCR + 説明文生成
      const isPdf = ext === ".pdf";
      const analysis = await analyzeImage(base64Image, mediaType, isPdf);
      console.log(
        `Analysis done — ocr: "${analysis.ocrText.slice(0, 60)}", desc: "${analysis.description.slice(0, 60)}"`,
      );

      // 3. テキストを dataSourceBucket に保存（Bedrock KB の ingestion 対象）
      const textContent = [
        `# Image: ${filename}`,
        "",
        "## OCR Text",
        analysis.ocrText || "(no text found)",
        "",
        "## Description",
        analysis.description,
        "",
        `## Metadata`,
        `- imageId: ${imageId}`,
        `- filename: ${filename}`,
        `- s3Key: ${key}`,
        `- processedAt: ${new Date().toISOString()}`,
      ].join("\n");

      await s3.send(
        new PutObjectCommand({
          Bucket: DATA_SOURCE_BUCKET,
          Key: `images/${imageId}.txt`,
          Body: textContent,
          ContentType: "text/plain; charset=utf-8",
        }),
      );

      console.log(`Done: ${imageId}/${filename} -> images/${imageId}.txt`);
    } catch (err) {
      console.error(`Failed to process ${imageId}/${filename}:`, err);
    }
  }
};

async function analyzeImage(
  base64Image: string,
  mediaType: string,
  isPdf: boolean,
): Promise<{ ocrText: string; description: string }> {
  const fileContent = isPdf
    ? {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: base64Image,
        },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mediaType,
          data: base64Image,
        },
      };

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: VLM_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              fileContent,
              {
                type: "text",
                text: `この画像を分析してください。以下の2つの情報をJSON形式で返してください。

1. "ocrText": 画像内に表示されているテキストをすべて抽出（テキストがない場合は空文字列）
2. "description": 画像の内容を詳しく説明（写っているもの、場所、テーマ、色調、雰囲気など）

JSONのみを返してください（コードブロック不要）:
{"ocrText": "...", "description": "..."}`,
              },
            ],
          },
        ],
      }),
    }),
  );

  const body = JSON.parse(new TextDecoder().decode(response.body));
  const text: string = body.content?.[0]?.text ?? "{}";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ocrText: String(parsed.ocrText ?? ""),
        description: String(parsed.description ?? ""),
      };
    }
  } catch {
    console.error("Failed to parse VLM response:", text.slice(0, 200));
  }

  return { ocrText: "", description: text };
}

function resolveMediaType(ext: string): string {
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return "image/jpeg";
}
