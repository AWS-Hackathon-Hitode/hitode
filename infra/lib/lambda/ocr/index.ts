import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const bedrock = new BedrockRuntimeClient();
const s3 = new S3Client();

const BUCKET = process.env.BUCKET!;
const OCR_MODEL_ID = process.env.OCR_MODEL_ID!;

interface OcrEvent {
  videoId: string;
}

interface SlideOcrResult {
  frameFile: string;
  timestamp: number;
  text: string;
}

export const handler = async (event: OcrEvent) => {
  const { videoId } = event;
  console.log(`Starting OCR for video: ${videoId}`);

  // 1. processed/{videoId}/transcript.json からフレーム情報を取得
  const transcriptObj = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: `processed/${videoId}/transcript.json`,
    }),
  );
  const transcriptData = JSON.parse(
    await transcriptObj.Body!.transformToString(),
  );
  const frames: { frameFile: string; timestamp: number }[] =
    transcriptData.frames || [];

  if (frames.length === 0) {
    console.log("No keyframes found, skipping OCR");
    const result = { videoId, slides: [] };
    await saveResult(videoId, result);
    return result;
  }

  console.log(`Processing ${frames.length} keyframes`);

  // 2. 各キーフレームに対してOCR実行
  const slides: SlideOcrResult[] = [];

  for (const frame of frames) {
    try {
      const slideText = await ocrFrame(videoId, frame.frameFile);
      slides.push({
        frameFile: frame.frameFile,
        timestamp: frame.timestamp,
        text: slideText,
      });
      console.log(
        `OCR done: ${frame.frameFile} (${frame.timestamp}s) -> ${slideText.slice(0, 50)}...`,
      );
    } catch (err) {
      console.error(`OCR failed for ${frame.frameFile}:`, err);
      slides.push({
        frameFile: frame.frameFile,
        timestamp: frame.timestamp,
        text: "",
      });
    }
  }

  // 3. 結果をS3に保存
  const result = { videoId, slides };
  await saveResult(videoId, result);

  console.log(`OCR complete: ${slides.length} slides processed`);
  return result;
};

async function ocrFrame(
  videoId: string,
  frameFile: string,
): Promise<string> {
  // S3からフレーム画像を取得
  const imageObj = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: `processed/${videoId}/frames/${frameFile}`,
    }),
  );
  const imageBytes = await imageObj.Body!.transformToByteArray();
  const base64Image = Buffer.from(imageBytes).toString("base64");

  // Bedrock Claude Vision でOCR
  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: OCR_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: "この画像はプレゼンテーションスライドです。スライドに表示されているテキストを全て抽出してください。装飾や書式の説明は不要で、テキスト内容のみを返してください。",
              },
            ],
          },
        ],
      }),
    }),
  );

  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.content?.[0]?.text ?? "";
}

async function saveResult(videoId: string, result: unknown) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `processed/${videoId}/ocr.json`,
      Body: JSON.stringify(result, null, 2),
      ContentType: "application/json",
    }),
  );
}
