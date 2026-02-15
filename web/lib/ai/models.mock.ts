import type { LanguageModel, ModelMessage } from "ai";
import { getResponseChunksByPrompt } from "@/tests/prompts/utils";

const createMockModel = (isReasoningEnabled = false): LanguageModel => {
  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-model",
    defaultObjectGenerationMode: "tool",
    supportedUrls: [],
    supportsImageUrls: false,
    supportsStructuredOutputs: false,
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      content: [{ type: "text", text: "Hello, world!" }],
      warnings: [],
    }),
    doStream: async ({ prompt }: { prompt: ModelMessage[] }) => {
      const chunks = getResponseChunksByPrompt(prompt, isReasoningEnabled);

      return {
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  } as unknown as LanguageModel;
};

export const chatModel = createMockModel();
export const reasoningModel = createMockModel(true);
export const titleModel = createMockModel();
export const artifactModel = createMockModel();
