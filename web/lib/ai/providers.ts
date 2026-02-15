import { bedrock } from "@ai-sdk/amazon-bedrock";

import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

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
        "chat-model": bedrock("jp.anthropic.claude-sonnet-4-5-20250929-v1:0"),
        "chat-model-reasoning": wrapLanguageModel({
          model: bedrock("jp.anthropic.claude-haiku-4-5-20251001-v1:0"),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        }),
        "title-model": bedrock("jp.anthropic.claude-sonnet-4-5-20250929-v1:0"),
        "artifact-model": bedrock(
          "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
        ),
      },
    });
