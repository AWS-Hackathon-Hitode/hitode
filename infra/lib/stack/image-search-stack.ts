import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as path from "node:path";
import type { Construct } from "constructs";
import type { EnvironmentConfig } from "../config/environmental_config";

interface ImageSearchStackProps extends cdk.StackProps {
  stage: string;
  config: NonNullable<EnvironmentConfig["imageSearch"]>;
  vpc: ec2.IVpc;
}

export class ImageSearchStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ImageSearchStackProps) {
    super(scope, id, props);

    const tag = `image-search-${props.stage}`;

    // ===== S3 バケット =====
    // バケットと Lambda を同一スタックに置くことで cross-stack 循環依存を回避
    this.bucket = new s3.Bucket(this, "ImageBucket", {
      bucketName: `${tag}-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          // 処理済みメタデータは 30 日で削除
          prefix: "processed/",
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // ===== Image Processor Lambda =====
    const processorLambda = new lambdaNodejs.NodejsFunction(
      this,
      "ImageProcessorLambda",
      {
        functionName: `${tag}-processor`,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(__dirname, "../lambda/image-processor/index.ts"),
        handler: "handler",
        timeout: cdk.Duration.minutes(5),
        memorySize: 1024,
        environment: {
          BUCKET: this.bucket.bucketName,
          VLM_MODEL_ID: props.config.vlmModelId,
          EMBEDDING_MODEL_ID: props.config.embeddingModelId,
        },
        bundling: { externalModules: [] },
      },
    );

    // S3 への読み書き権限
    this.bucket.grantReadWrite(processorLambda);

    // Bedrock モデル呼び出し権限
    processorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          // VLM: クロスリージョン推論プロファイル + 基盤モデルの両方が必要
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${props.config.vlmModelId}`,
          `arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-20250514-v1:0`,
          // Embedding はファンデーションモデル
          `arn:aws:bedrock:${this.region}::foundation-model/${props.config.embeddingModelId}`,
        ],
      }),
    );

    // Bedrock モデルアクセスに必要な AWS Marketplace 権限
    processorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "aws-marketplace:ViewSubscriptions",
          "aws-marketplace:Subscribe",
        ],
        resources: ["*"],
      }),
    );

    // ===== S3 → Lambda トリガー =====
    // raw-images/ に画像がアップロードされたら自動起動
    this.bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processorLambda),
      { prefix: "raw-images/" },
    );

    // ===== Outputs =====
    new cdk.CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
      description: "Image Search S3 bucket name",
    });

    new cdk.CfnOutput(this, "ProcessorFunctionName", {
      value: processorLambda.functionName,
      description: "Image processor Lambda function name",
    });
  }
}
