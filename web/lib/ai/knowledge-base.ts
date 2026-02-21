import {
  BedrockAgentRuntimeClient,
  type RetrievalResultContent,
  RetrieveCommand,
  type RetrieveCommandInput,
  type RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";

const client = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

export interface RetrievalResult {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
  imageUrl?: string;
  caption?: string;
  tags?: string[];
  sourceKey?: string;
  mimeType?: string;
}

/**
 * Retrieve relevant documents from Amazon Bedrock Knowledge Base
 * @param query - The user's query to search for relevant documents
 * @param knowledgeBaseId - The ID of the knowledge base (defaults to env var)
 * @param numberOfResults - Number of results to retrieve (default: 5)
 * @returns Array of retrieved document contents with scores
 */
export async function retrieveFromKnowledgeBase(
  query: string,
  knowledgeBaseId?: string,
  numberOfResults = 5,
): Promise<RetrievalResult[]> {
  const kbId = knowledgeBaseId || process.env.KNOWLEDGE_BASE_ID;

  if (!kbId) {
    throw new Error(
      "KNOWLEDGE_BASE_ID is not configured in environment variables",
    );
  }

  const input: RetrieveCommandInput = {
    knowledgeBaseId: kbId,
    retrievalQuery: {
      text: query,
    },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults,
        overrideSearchType: "HYBRID", // セマンティック + キーワード検索
        rerankingConfiguration: {
          type: "BEDROCK_RERANKING_MODEL",
          bedrockRerankingConfiguration: {
            numberOfRerankedResults: numberOfResults,
            modelConfiguration: {
              // AWS ネイティブのリランキングモデル（サブスクリプション不要）
              modelArn: `arn:aws:bedrock:${process.env.AWS_REGION}::foundation-model/amazon.rerank-v1:0`,
            },
          },
        },
      },
    },
  };

  try {
    const command = new RetrieveCommand(input);
    const response: RetrieveCommandOutput = await client.send(command);

    if (!response.retrievalResults) {
      return [];
    }

    return response.retrievalResults.map((result) => {
      const content = extractContent(result.content);
      const metadata = toRecord(result.metadata);
      const fallback = parseImageFieldsFromContent(content);

      return {
        content,
        score: result.score,
        metadata,
        imageUrl: getString(metadata, "imageUrl") ?? fallback.imageUrl,
        caption: getString(metadata, "caption") ?? fallback.caption,
        tags: getStringArray(metadata, "tags") ?? fallback.tags,
        sourceKey: getString(metadata, "sourceKey"),
        mimeType: getString(metadata, "mimeType"),
      };
    });
  } catch (error) {
    console.error("Error retrieving from knowledge base:", error);
    throw error;
  }
}

/**
 * Extract text content from retrieval result
 */
function extractContent(content: RetrievalResultContent | undefined): string {
  if (!content) {
    return "";
  }

  if (content.text) {
    return content.text;
  }

  return "";
}

/**
 * Format retrieved documents into a context string for the LLM
 * @param results - Retrieved documents
 * @returns Formatted context string
 */
export function formatRetrievalContext(results: RetrievalResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const contextParts = results.map((result, index) => {
    let formattedResult = `[Document ${index + 1}]`;
    if (result.score !== undefined) {
      formattedResult += ` (Relevance: ${(result.score * 100).toFixed(1)}%)`;
    }
    const extraLines: string[] = [];

    if (result.caption) {
      extraLines.push(`Caption: ${result.caption}`);
    }
    if (result.tags?.length) {
      extraLines.push(`Tags: ${result.tags.join(", ")}`);
    }
    if (result.imageUrl) {
      extraLines.push(`Image URL: ${result.imageUrl}`);
    }

    formattedResult += `\n${extraLines.length > 0 ? `${extraLines.join("\n")}\n` : ""}${result.content}`;
    return formattedResult;
  });

  return `Relevant information from knowledge base:\n\n${contextParts.join("\n\n")}`;
}

function toRecord(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return metadata && typeof metadata === "object" ? metadata : {};
}

function getString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getStringArray(
  metadata: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = metadata[key];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return undefined;
}

function parseImageFieldsFromContent(content: string): {
  imageUrl?: string;
  caption?: string;
  tags?: string[];
} {
  const imageUrl =
    matchCapture(content, /imageUrl:\s*(https?:\/\/\S+)/i) ??
    matchCapture(content, /"imageUrl"\s*:\s*"([^"]+)"/);
  const caption =
    matchCapture(content, /画像説明:\s*(.+)/) ??
    matchCapture(content, /caption:\s*(.+)/i) ??
    matchCapture(content, /"caption"\s*:\s*"([^"]+)"/);
  const tagsLine =
    matchCapture(content, /タグ:\s*(.+)/) ??
    matchCapture(content, /tags:\s*(.+)/i);
  const tags =
    tagsLine?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];

  return {
    imageUrl,
    caption,
    tags: tags.length > 0 ? tags : undefined,
  };
}

function matchCapture(text: string, pattern: RegExp): string | undefined {
  const matched = text.match(pattern);
  return matched?.[1]?.trim();
}
