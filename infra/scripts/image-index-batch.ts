import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const region = process.env.AWS_REGION || "ap-northeast-1";
const bucket = process.env.IMAGE_INDEX_BUCKET;
const inputPrefix = process.env.IMAGE_INDEX_INPUT_PREFIX || "documents/images/";
const outputKey =
  process.env.IMAGE_INDEX_OUTPUT_KEY ||
  `documents/image-index/image-index-${Date.now()}.jsonl`;
const modelId =
  process.env.IMAGE_INDEX_VLM_MODEL_ID ||
  "jp.anthropic.claude-sonnet-4-5-20250929-v1:0";
const publicBaseUrl = process.env.IMAGE_INDEX_PUBLIC_BASE_URL;
const maxImages = Number.parseInt(process.env.IMAGE_INDEX_MAX_IMAGES || "200", 10);

if (!bucket) {
  throw new Error("IMAGE_INDEX_BUCKET is required.");
}

const s3 = new S3Client({ region });
const bedrock = new BedrockRuntimeClient({ region });

type IndexedImageRecord = {
  imageUrl: string;
  sourceKey: string;
  mimeType: string;
  caption: string;
  tags: string[];
};

async function main() {
  const keys = await listImageKeys();
  const selectedKeys = keys.slice(0, maxImages);

  if (selectedKeys.length === 0) {
    console.log("No image files found. Nothing to index.");
    return;
  }

  const records: IndexedImageRecord[] = [];
  let failureCount = 0;

  for (const [index, key] of selectedKeys.entries()) {
    try {
      console.log(`[${index + 1}/${selectedKeys.length}] Processing ${key}`);
      const { bytes, mimeType } = await getImageBytes(key);
      const analysis = await analyzeImageWithVlm(bytes, mimeType);
      records.push({
        imageUrl: resolveImageUrl(key),
        sourceKey: key,
        mimeType,
        caption: analysis.caption,
        tags: analysis.tags,
      });
    } catch (error) {
      failureCount += 1;
      console.warn(`Failed to process ${key}:`, error);
    }
  }

  if (records.length === 0) {
    throw new Error("All image indexing tasks failed.");
  }

  const body = records.map((record) => JSON.stringify(record)).join("\n");
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: outputKey,
      Body: body,
      ContentType: "application/x-ndjson",
    }),
  );

  console.log("Image index file uploaded.");
  console.log(`  s3://${bucket}/${outputKey}`);
  console.log(`  indexed: ${records.length}, failed: ${failureCount}`);
  console.log("Next step: start a Bedrock Knowledge Base ingestion job.");
}

async function listImageKeys(): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: inputPrefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of response.Contents ?? []) {
      if (!item.Key) {
        continue;
      }
      if (isImageKey(item.Key)) {
        keys.push(item.Key);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  );
}

async function getImageBytes(
  key: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  const body = response.Body;
  if (!body) {
    throw new Error(`S3 object body is empty for key: ${key}`);
  }

  const bytes = new Uint8Array(await body.transformToByteArray());
  const mimeType = response.ContentType || guessMimeType(key);

  return { bytes, mimeType };
}

function guessMimeType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function analyzeImageWithVlm(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ caption: string; tags: string[] }> {
  const base64Image = Buffer.from(bytes).toString("base64");
  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 300,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: base64Image,
            },
          },
          {
            type: "text",
            text: [
              "この画像をRAG検索用に要約してください。",
              "必ず次のJSON形式だけを返してください。",
              '{"caption":"50文字以内の説明","tags":["タグ1","タグ2","タグ3"]}',
              "タグは最大6個、日本語で返してください。",
            ].join("\n"),
          },
        ],
      },
    ],
  };

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody),
    }),
  );

  if (!response.body) {
    throw new Error("Bedrock response body is empty.");
  }

  const parsedResponse = JSON.parse(
    Buffer.from(response.body).toString("utf8"),
  ) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = parsedResponse.content
    ?.find((block) => block.type === "text")
    ?.text?.trim();

  if (!text) {
    throw new Error("No text found in Bedrock response.");
  }

  const jsonCandidate = extractJsonObject(text);
  const parsed = JSON.parse(jsonCandidate) as {
    caption?: string;
    tags?: string[];
  };

  const caption = (parsed.caption || "").trim();
  const tags = (parsed.tags || [])
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 6);

  if (!caption) {
    throw new Error("VLM response caption is empty.");
  }

  return {
    caption,
    tags,
  };
}

function extractJsonObject(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error(`Failed to locate JSON object in model output: ${text}`);
  }
  return text.slice(first, last + 1);
}

function resolveImageUrl(key: string): string {
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, "")}/${encodeURIComponentPath(key)}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponentPath(key)}`;
}

function encodeURIComponentPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

main().catch((error) => {
  console.error("Image indexing batch failed:", error);
  process.exit(1);
});
