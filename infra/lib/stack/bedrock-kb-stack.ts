import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import {
  aws_s3 as s3,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_s3_notifications as s3n,
  RemovalPolicy,
  CfnOutput,
} from "aws-cdk-lib";

import {
  bedrock,
  opensearchserverless,
} from "@cdklabs/generative-ai-cdk-constructs";

interface BedrockKbStackProps extends cdk.StackProps {
  stage: string;
}

export class AmazonBedrockKbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BedrockKbStackProps) {
    super(scope, id, props);

    const tag = `bedrock-kb-${props.stage}`;

    /* =========================
       1. Upload用バケット
       ========================= */

    const rawBucket = new s3.Bucket(this, "RawImageBucket", {
      bucketName: `${tag}-raw-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ["http://localhost:3000"],
          allowedHeaders: ["*"],
        },
      ],
    });

    /* =========================
       2. KB DataSource用バケット
       ========================= */

    const dataSourceBucket = new s3.Bucket(this, "DataSourceBucket", {
      bucketName: `${tag}-datasource-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    /* =========================
       3. OpenSearch Serverless
       ========================= */

    const vectorCollection =
      new opensearchserverless.VectorCollection(this, "VectorCollection", {
        collectionName: `${tag}-collection`,
        standbyReplicas:
          opensearchserverless.VectorCollectionStandbyReplicas.DISABLED,
      });

    /* =========================
       4. Knowledge Base
       ========================= */

    const knowledgeBase = new bedrock.VectorKnowledgeBase(
      this,
      "KnowledgeBase",
      {
        vectorStore: vectorCollection,
        embeddingsModel:
          bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
        vectorField: "vector",
        name: `${tag}-kb`,
        description: "Image Knowledge Base",
      }
    );

    const s3DataSource = knowledgeBase.addS3DataSource({
      bucket: dataSourceBucket,
      dataSourceName: `${tag}-s3-source`,
      chunkingStrategy: bedrock.ChunkingStrategy.NONE,
    });

    /* =========================
       5. Raw → DataSource Copy Lambda
       ========================= */

    const copyLambda = new nodejs.NodejsFunction(this, "CopyLambda", {
      entry: path.resolve(__dirname, "../../lambda/copy/index.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        TARGET_BUCKET: dataSourceBucket.bucketName,
      },
    });

    rawBucket.grantRead(copyLambda);
    dataSourceBucket.grantWrite(copyLambda);

    rawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(copyLambda)
    );

    /* =========================
       6. Ingestion Lambda
       ========================= */

    const syncLambda = new nodejs.NodejsFunction(this, "SyncLambda", {
      entry: path.resolve(__dirname, "../../lambda/sync-kb/index.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        DATA_SOURCE_ID: s3DataSource.dataSourceId,
      },
    });

    syncLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:StartIngestionJob"],
        resources: [knowledgeBase.knowledgeBaseArn],
      })
    );

    dataSourceBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(syncLambda)
    );

    /* =========================
       7. Outputs
       ========================= */

    new CfnOutput(this, "RawImageBucketName", {
      value: rawBucket.bucketName,
    });

    new CfnOutput(this, "DataSourceBucketName", {
      value: dataSourceBucket.bucketName,
    });

    new CfnOutput(this, "KnowledgeBaseId", {
      value: knowledgeBase.knowledgeBaseId,
    });
  }
}