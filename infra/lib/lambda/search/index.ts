import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const bedrock = new BedrockRuntimeClient();
const s3 = new S3Client();

const BUCKET = process.env.BUCKET!;
const EMBEDDING_MODEL_ID = process.env.EMBEDDING_MODEL_ID!;
const TOP_K = 5;

interface VectorChunk {
  id: number;
  text: string;
  startTime: number;
  endTime: number;
  source: string;
  embedding: number[];
}

interface SearchResult {
  text: string;
  startTime: number;
  endTime: number;
  source: string;
  score: number;
  videoId: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { query, videoId } = body as {
      query: string;
      videoId?: string;
    };

    if (!query) {
      return response(400, { error: "query is required" });
    }

    // 1. クエリをベクトル化
    const queryEmbedding = await getEmbedding(query);

    // 2. 対象の vectors.json を読み込み
    const allChunks = await loadVectors(videoId);

    // 3. cosine similarity 計算
    const results: SearchResult[] = allChunks
      .map((item) => ({
        text: item.chunk.text,
        startTime: item.chunk.startTime,
        endTime: item.chunk.endTime,
        source: item.chunk.source,
        score: cosineSimilarity(queryEmbedding, item.chunk.embedding),
        videoId: item.videoId,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    return response(200, { query, results });
  } catch (err) {
    console.error("Search error:", err);
    return response(500, { error: "Internal server error" });
  }
};

async function loadVectors(
  videoId?: string,
): Promise<{ videoId: string; chunk: VectorChunk }[]> {
  const allChunks: { videoId: string; chunk: VectorChunk }[] = [];

  if (videoId) {
    // 特定の動画のみ
    const data = await readVectorFile(`vectors/${videoId}.json`);
    if (data) {
      for (const chunk of data.chunks) {
        allChunks.push({ videoId: data.videoId, chunk });
      }
    }
  } else {
    // 全動画を検索
    const listResult = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: "vectors/",
        MaxKeys: 100,
      }),
    );

    for (const obj of listResult.Contents || []) {
      if (!obj.Key?.endsWith(".json")) continue;
      const data = await readVectorFile(obj.Key);
      if (data) {
        for (const chunk of data.chunks) {
          allChunks.push({ videoId: data.videoId, chunk });
        }
      }
    }
  }

  return allChunks;
}

async function readVectorFile(
  key: string,
): Promise<{ videoId: string; chunks: VectorChunk[] } | null> {
  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    return JSON.parse(await obj.Body!.transformToString());
  } catch {
    return null;
  }
}

async function getEmbedding(text: string): Promise<number[]> {
  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text }),
    }),
  );
  const body = JSON.parse(new TextDecoder().decode(res.body));
  return body.embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function response(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}
