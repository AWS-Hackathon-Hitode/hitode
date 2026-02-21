import { tool } from "ai";
import { z } from "zod";
import {
  formatRetrievalContext,
  retrieveFromKnowledgeBase,
} from "@/lib/ai/knowledge-base";

export const searchKnowledgeBase = tool({
  description:
    "Search the knowledge base for relevant information about the codebase, documentation, technical decisions, requirements, design, and indexed images. Use this tool when you need to answer questions about: system architecture, code implementation, technical specifications, project requirements, design decisions, meeting notes, or to retrieve related images by text query.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(300)
      .describe(
        "The search query to find relevant information in the knowledge base",
      ),
    numberOfResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe("Number of results to retrieve (default: 5)"),
  }),
  execute: async (input) => {
    const { query, numberOfResults = 5 } = input;
    try {
      const results = await retrieveFromKnowledgeBase(
        query,
        undefined,
        numberOfResults,
      );

      if (results.length === 0) {
        return {
          success: true,
          message: "No relevant information found in the knowledge base.",
          results: [],
        };
      }

      const formattedContext = formatRetrievalContext(results);

      return {
        success: true,
        message: `Found ${results.length} relevant document(s).`,
        context: formattedContext,
        results: results.map((result, index) => ({
          index: index + 1,
          imageUrl: result.imageUrl,
          caption: result.caption,
          tags: result.tags ?? [],
          sourceKey: result.sourceKey,
          mimeType: result.mimeType,
          content: result.content,
          relevance: result.score
            ? `${(result.score * 100).toFixed(1)}%`
            : "N/A",
          metadata: result.metadata,
        })),
      };
    } catch (error) {
      console.error("Knowledge base search failed:", error);
      return {
        success: false,
        message: `Failed to search knowledge base: ${error instanceof Error ? error.message : "Unknown error"}`,
        results: [],
      };
    }
  },
});
