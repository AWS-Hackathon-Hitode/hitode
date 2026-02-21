#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import { getConfig } from "../lib/config/environmental_config";
import { AmazonBedrockKbStack } from "../lib/stack/bedrock-kb-stack";
import { SageMakerStack } from "../lib/stack/sagemaker-stack"; // 1. 追加したスタックをインポート

dotenv.config();

const app = new cdk.App();

const stage = app.node.tryGetContext("stage") || "test";
const stagePrefix = stage.charAt(0).toUpperCase() + stage.slice(1);
const config = getConfig(stage);

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION,
};

// 2. Bedrock Stack を先に定義（S3バケット等の情報を後続に渡すため）
const bedrockKbStack = new AmazonBedrockKbStack(app, `BedrockKbStack${stagePrefix}`, {
  stage,
  env,
});

// 3. SageMaker Stack を定義
// 必要に応じて、bedrockKbStack で作成したバケットの参照などを props で渡します
new SageMakerStack(app, `SageMakerStack${stagePrefix}`, {
  stage,
  env,
  // 作業に必要であれば、bedrockKbStackからバケット情報を渡す設計にします
  // dataSourceBucket: bedrockKbStack.dataSourceBucket 
});