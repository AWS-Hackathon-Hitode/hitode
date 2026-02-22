import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "@/lib/constants";

const region = process.env.AWS_REGION ?? "us-east-1";

const bedrockProvider = createAmazonBedrock({
  region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  // ★正しいホストを強制（ハイフンじゃなくドット）
  baseURL: `https://bedrock-runtime.${region}.amazonaws.com`,
});

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : customProvider({
      languageModels: {
        "chat-model": bedrockProvider("anthropic.claude-3-5-sonnet-20240620-v1:0"),
        "chat-model-reasoning": wrapLanguageModel({
          model: bedrockProvider("anthropic.claude-3-haiku-20240307-v1:0"),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        }),
        "title-model": bedrockProvider("anthropic.claude-3-5-sonnet-20240620-v1:0"),
        "artifact-model": bedrockProvider("anthropic.claude-3-5-sonnet-20240620-v1:0"),
      },
    });
