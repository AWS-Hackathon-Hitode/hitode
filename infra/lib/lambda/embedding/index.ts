import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const bedrock = new BedrockRuntimeClient();
const s3 = new S3Client();

const BUCKET = process.env.BUCKET!;
const EMBEDDING_MODEL_ID = process.env.EMBEDDING_MODEL_ID!;

interface EmbeddingEvent {
  videoId: string;
}

interface Chunk {
  id: number;
  text: string;
  startTime: number;
  endTime: number;
  source: string;
}

export const handler = async (event: EmbeddingEvent) => {
  const { videoId } = event;
  console.log(`Starting embedding for video: ${videoId}`);

  // 1. chunks.json 読み込み
  const chunksObj = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: `chunked/${videoId}/chunks.json`,
    }),
  );
  const chunksData = JSON.parse(await chunksObj.Body!.transformToString());
  const chunks: Chunk[] = chunksData.chunks;

  console.log(`Embedding ${chunks.length} chunks`);

  // 2. 各チャンクをベクトル化
  const vectorizedChunks = [];
  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.text);
    vectorizedChunks.push({
      ...chunk,
      embedding,
    });
  }

  // 3. vectors.json として S3 に保存
  const output = {
    videoId,
    chunkCount: vectorizedChunks.length,
    chunks: vectorizedChunks,
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `vectors/${videoId}.json`,
      Body: JSON.stringify(output),
      ContentType: "application/json",
    }),
  );

  console.log(`Embedding complete: ${vectorizedChunks.length} vectors saved`);
  return { videoId, chunkCount: vectorizedChunks.length };
};

async function getEmbedding(text: string): Promise<number[]> {
  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        inputText: text,
      }),
    }),
  );

  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.embedding;
}
