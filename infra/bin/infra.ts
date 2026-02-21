#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import { getConfig } from "../lib/config/environmental_config";
import { AmazonBedrockKbStack } from "../lib/stack/bedrock-kb-stack";
import { ImageSearchStack } from "../lib/stack/image-search-stack";
import { NetworkStack } from "../lib/stack/network-stack";
import { SecretsStack } from "../lib/stack/secrets-stack";
import { VideoProcessingStack } from "../lib/stack/video-processing-stack";
import { VideoStorageStack } from "../lib/stack/video-storage-stack";

dotenv.config();

const app = new cdk.App();

// 環境名を取得
const stage = app.node.tryGetContext("stage") || "test";
const stagePrefix = stage.charAt(0).toUpperCase() + stage.slice(1);

// 環境設定を取得（エントリーポイントでのみ呼び出す）
const config = getConfig(stage);

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION,
};

// --- Network スタック（VPC）---
const networkStack = new NetworkStack(app, `NetworkStack${stagePrefix}`, {
  stage,
  vpcCidr: config.vpc.cidr,
  maxAzs: config.vpc.maxAzs,
  env,
});

// Secrets スタック（認証情報を管理）
const secretsStack = new SecretsStack(app, `SecretsStack${stagePrefix}`, {
  stage,
  confluence: config.bedrockKb?.confluence
    ? {
        confluenceAppKey: config.bedrockKb.confluence.confluenceAppKey,
        confluenceAppSecret: config.bedrockKb.confluence.confluenceAppSecret,
        confluenceAccessToken:
          config.bedrockKb.confluence.confluenceAccessToken,
        confluenceRefreshToken:
          config.bedrockKb.confluence.confluenceRefreshToken,
      }
    : undefined,
  env,
});

// Bedrock Knowledge Base スタック（オプション）
const bedrockKbConfig = config.bedrockKb;
if (bedrockKbConfig) {
  new AmazonBedrockKbStack(app, `BedrockKbStack${stagePrefix}`, {
    stage,
    confluence:
      bedrockKbConfig.confluence && secretsStack.confluenceSecretArn
        ? {
            secretArn: secretsStack.confluenceSecretArn,
            hostUrl: bedrockKbConfig.confluence.hostUrl,
            spaces: bedrockKbConfig.confluence.spaces,
          }
        : undefined,
    env,
  });
}

// --- Image Search スタック ---
const imageSearchConfig = config.imageSearch;
if (imageSearchConfig) {
  new ImageSearchStack(app, `ImageSearchStack${stagePrefix}`, {
    stage,
    config: imageSearchConfig,
    vpc: networkStack.vpc,
    env,
  });
}

// --- Video Search スタック ---
const videoSearchConfig = config.videoSearch;
if (videoSearchConfig) {
  const videoStorageStack = new VideoStorageStack(
    app,
    `VideoStorageStack${stagePrefix}`,
    { stage, env },
  );

  new VideoProcessingStack(app, `VideoProcessingStack${stagePrefix}`, {
    stage,
    config: videoSearchConfig,
    bucket: videoStorageStack.bucket,
    env,
  });
}
