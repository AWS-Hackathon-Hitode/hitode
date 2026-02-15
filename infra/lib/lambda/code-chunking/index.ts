import type { Readable } from "node:stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { CodeChunker, type SupportedLanguage } from "./chunker";

// 正しいイベント構造
interface BedrockCustomTransformationEvent {
  version: string;
  knowledgeBaseId: string;
  dataSourceId: string;
  ingestionJobId: string;
  bucketName: string;
  priorTask: string;
  inputFiles: Array<{
    originalFileLocation: {
      type: "S3";
      s3_location: {
        uri: string;
      };
    };
    fileMetadata?: Record<string, string>;
    contentBatches: Array<{
      key: string;
    }>;
  }>;
}

// 正しい出力構造
interface BedrockCustomTransformationOutput {
  outputFiles: Array<{
    originalFileLocation: {
      type: "S3";
      s3_location: {
        uri: string;
      };
    };
    fileMetadata?: Record<string, string>;
    contentBatches: Array<{
      key: string;
    }>;
  }>;
}

// contentBatches用のファイル構造
interface FileContents {
  fileContents: Array<{
    contentBody: string;
    contentType: "TEXT";
    contentMetadata: Record<string, string>;
  }>;
}

const s3Client = new S3Client({});

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

// S3 URIからバケット名とキーを抽出
function parseS3Uri(uri: string): { bucket: string; key: string } {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid S3 URI: ${uri}`);
  }
  return { bucket: match[1], key: match[2] };
}

// S3 key から Git メタデータを抽出
// 想定フォーマット: provider/org/repository/src/...
function parseGitMetadata(s3Key: string): {
  gitProvider: string;
  gitOrganization: string;
  gitRepository: string;
} | null {
  const parts = s3Key.split("/");

  if (parts.length < 3) {
    return null;
  }

  return {
    gitProvider: parts[0],
    gitOrganization: parts[1],
    gitRepository: parts[2],
  };
}

// コンテンツバッチからソースコードを取得
async function getContentFromBatch(
  bucketName: string,
  batchKey: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: batchKey,
  });

  const response = await s3Client.send(command);
  const stream = response.Body as Readable;
  const jsonStr = await streamToString(stream);

  const fileContents: FileContents = JSON.parse(jsonStr);

  // すべてのcontentBodyを結合（通常は1つのはず）
  return fileContents.fileContents
    .map((content) => content.contentBody)
    .join("\n");
}

function detectLanguage(filePath: string): SupportedLanguage | "text" | null {
  const extension = filePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "java":
      return "java";
    case "cs":
      return "csharp";
    case "md":
    case "txt":
    case "json":
    case "yaml":
    case "yml":
    case "xml":
    case "html":
    case "css":
      return "text";
    default:
      return null;
  }
}

function chunkTextByParagraph(
  content: string,
  filePath: string,
  gitMetadata: {
    gitProvider: string;
    gitOrganization: string;
    gitRepository: string;
  } | null,
  maxChunkSize = 1000,
): Array<{ text: string; metadata: Record<string, string> }> {
  const chunks: Array<{ text: string; metadata: Record<string, string> }> = [];

  const paragraphs = content
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0);

  let currentChunk = "";
  let chunkStartLine = 1;
  let currentLine = 1;

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n");

    if (
      currentChunk.length > 0 &&
      currentChunk.length + paragraph.length > maxChunkSize
    ) {
      const metadata: Record<string, string> = {
        filePath,
        type: "text",
        startLine: chunkStartLine.toString(),
        endLine: (currentLine - 1).toString(),
      };

      if (gitMetadata) {
        metadata.gitProvider = gitMetadata.gitProvider;
        metadata.gitOrganization = gitMetadata.gitOrganization;
        metadata.gitRepository = gitMetadata.gitRepository;
      }

      chunks.push({
        text: currentChunk.trim(),
        metadata,
      });

      currentChunk = "";
      chunkStartLine = currentLine;
    }

    currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    currentLine += lines.length + 1;
  }

  if (currentChunk.trim().length > 0) {
    const metadata: Record<string, string> = {
      filePath,
      type: "text",
      startLine: chunkStartLine.toString(),
      endLine: currentLine.toString(),
    };

    if (gitMetadata) {
      metadata.gitProvider = gitMetadata.gitProvider;
      metadata.gitOrganization = gitMetadata.gitOrganization;
      metadata.gitRepository = gitMetadata.gitRepository;
    }

    chunks.push({
      text: currentChunk.trim(),
      metadata,
    });
  }

  return chunks;
}

export const handler = async (
  event: BedrockCustomTransformationEvent,
): Promise<BedrockCustomTransformationOutput> => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const outputFiles: BedrockCustomTransformationOutput["outputFiles"] = [];

  // 各inputFileを処理
  for (const inputFile of event.inputFiles) {
    const s3Uri = inputFile.originalFileLocation.s3_location.uri;
    const { key: filePath } = parseS3Uri(s3Uri);

    console.log(`Processing file: ${filePath}`);

    // Gitメタデータを抽出
    const gitMetadata = parseGitMetadata(filePath);
    if (!gitMetadata) {
      console.log(
        `Warning: Could not parse Git metadata from path: ${filePath}`,
      );
    }

    // contentBatchesからコンテンツを取得（通常は1つのバッチ）
    let sourceCode = "";
    for (const batch of inputFile.contentBatches) {
      const batchContent = await getContentFromBatch(
        event.bucketName,
        batch.key,
      );
      sourceCode += batchContent;
    }

    console.log(`Retrieved ${sourceCode.length} characters from ${filePath}`);

    // 言語を検出
    const language = detectLanguage(filePath);

    let chunks: Array<{ text: string; metadata: Record<string, string> }> = [];

    if (!language) {
      console.log(`Unsupported file type for ${filePath}, skipping`);
      // 空のチャンクで処理を続行
      chunks = [];
    } else if (language === "text") {
      console.log(`Chunking ${filePath} as text`);
      chunks = chunkTextByParagraph(sourceCode, filePath, gitMetadata);
      console.log(`Generated ${chunks.length} text chunks`);
    } else {
      // tree-sitterでチャンキング
      console.log(`Chunking ${filePath} as ${language}`);
      const chunker = new CodeChunker(language);
      const codeChunks = chunker.chunk(sourceCode, filePath);
      console.log(`Generated ${codeChunks.length} code chunks`);

      // フォールバック: チャンクが0個の場合はテキストチャンキング
      if (codeChunks.length === 0) {
        console.log(
          `No code chunks found, falling back to text chunking for ${filePath}`,
        );
        chunks = chunkTextByParagraph(sourceCode, filePath, gitMetadata);
        console.log(`Generated ${chunks.length} text chunks (fallback)`);
      } else {
        // Code chunks を変換
        chunks = codeChunks.map((chunk) => {
          const metadata: Record<string, string> = {
            language: chunk.metadata.language,
            filePath: chunk.metadata.filePath,
            type: chunk.metadata.type,
            name: chunk.metadata.name || "",
            startLine: chunk.metadata.startLine.toString(),
            endLine: chunk.metadata.endLine.toString(),
          };

          // Gitメタデータを追加
          if (gitMetadata) {
            metadata.gitProvider = gitMetadata.gitProvider;
            metadata.gitOrganization = gitMetadata.gitOrganization;
            metadata.gitRepository = gitMetadata.gitRepository;
          }

          return {
            text: chunk.content,
            metadata,
          };
        });
      }
    }

    // チャンク結果をfileContents形式に変換
    const fileContents: FileContents = {
      fileContents: chunks.map((chunk) => ({
        contentBody: chunk.text,
        contentType: "TEXT",
        contentMetadata: chunk.metadata,
      })),
    };

    // S3にfileContentsを保存
    const transformationBucket = process.env.TRANSFORMATION_BUCKET ?? "";
    const outputKey = `transformations/${event.ingestionJobId}/${filePath}.json`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: transformationBucket,
        Key: outputKey,
        Body: JSON.stringify(fileContents),
        ContentType: "application/json",
      }),
    );

    console.log(`Saved chunks to s3://${transformationBucket}/${outputKey}`);

    // outputFilesに追加
    outputFiles.push({
      originalFileLocation: inputFile.originalFileLocation,
      fileMetadata: inputFile.fileMetadata,
      contentBatches: [
        {
          key: outputKey,
        },
      ],
    });
  }

  // 結果を返す
  return {
    outputFiles,
  };
};
