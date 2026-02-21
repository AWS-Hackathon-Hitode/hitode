import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import {
  aws_iam,
  aws_s3,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import * as s3_notifications from "aws-cdk-lib/aws-s3-notifications";
import {
  bedrock,
  opensearchserverless,
} from "@cdklabs/generative-ai-cdk-constructs";
import type { Construct } from "constructs";
import { getConfig } from "../config/environmental_config";

interface BedrockKbStackProps extends cdk.StackProps {
  stage: string;
}

export class AmazonBedrockKbStack extends cdk.Stack {
  public readonly vectorCollection: opensearchserverless.VectorCollection;

  constructor(scope: Construct, id: string, props: BedrockKbStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const config = getConfig(stage);
    const tag = `bedrock-kb-${stage}`;

    // 1. バケット定義
    const rawImageBucket = new aws_s3.Bucket(this, "RawImageBucket", {
      bucketName: `${tag}-raw-image-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const dataSourceBucket = new aws_s3.Bucket(this, "DataSourceBucket", {
      bucketName: `${tag}-data-source-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
    });

    // 2. SageMaker ロール
    const sagemakerRole = new aws_iam.Role(this, "SageMakerRole", {
      assumedBy: new aws_iam.ServicePrincipal("sagemaker.amazonaws.com"),
    });
    rawImageBucket.grantRead(sagemakerRole);
    dataSourceBucket.grantReadWrite(sagemakerRole);
    sagemakerRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess")
    );

    // 3. OpenSearch Serverless
    this.vectorCollection = new opensearchserverless.VectorCollection(this, "VectorCollection", {
      collectionName: `${tag}-collection`,
      standbyReplicas: opensearchserverless.VectorCollectionStandbyReplicas.DISABLED,
    });


    // 4. Knowledge Base (ここが重要：バリデーション回避)
    // 一旦、標準の V1 モデルとしてインスタンスを作成
    const model = bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1;

    // 型定義の裏をかいて、modelId と次元数を「画像用」に直接上書きする
    // (JavaScript の柔軟性を利用して、読み取り専用プロパティを書き換えます)
    const knowledgeBase = new bedrock.VectorKnowledgeBase(this, "KnowledgeBase", {
      vectorStore: this.vectorCollection,
      embeddingsModel: model,
      vectorField: "vector", // メソッドを保持したままのモデルを渡す
      name: `${tag}-image-kb`,
      description: `Knowledge base specialized in image analysis from S3`,
    });

    // 5. データソース
    const s3DataSource = knowledgeBase.addS3DataSource({
      bucket: dataSourceBucket,
      dataSourceName: `${tag}-s3-image-source`,
      chunkingStrategy: bedrock.ChunkingStrategy.NONE,
    });

    // 6. 同期用 Lambda
    const syncLambda = new nodejs.NodejsFunction(this, "SyncLambda", {
      entry: path.resolve(__dirname, '../../lambda/sync-kb/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        DATA_SOURCE_ID: s3DataSource.dataSourceId,
      },
    });

    // 7. 権限と通知
    syncLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: ["bedrock:StartIngestionJob"],
      resources: [knowledgeBase.knowledgeBaseArn],
    }));

    dataSourceBucket.addEventNotification(
      aws_s3.EventType.OBJECT_CREATED,
      new s3_notifications.LambdaDestination(syncLambda)
    );

    // Outputs
    new CfnOutput(this, "DataSourceBucketName", { value: dataSourceBucket.bucketName });
    new CfnOutput(this, "KnowledgeBaseId", { value: knowledgeBase.knowledgeBaseId });
  }
}