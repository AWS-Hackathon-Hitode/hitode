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

  console.log("[KB] retrieveFromKnowledgeBase called", { query });

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
      return {
        content,
        score: result.score,
        metadata: result.metadata,
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
    formattedResult += `\n${result.content}`;
    return formattedResult;
  });

  return `Relevant information from knowledge base:\n\n${contextParts.join("\n\n")}`;
}
