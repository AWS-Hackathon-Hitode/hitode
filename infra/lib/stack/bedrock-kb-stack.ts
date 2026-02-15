import * as path from "node:path";
import {
  bedrock,
  opensearchserverless,
} from "@cdklabs/generative-ai-cdk-constructs";
import * as cdk from "aws-cdk-lib";
import {
  aws_iam,
  aws_s3,
  aws_secretsmanager,
  CfnOutput,
  Duration,
  RemovalPolicy,
} from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import type { Construct } from "constructs";

interface BedrockKbStackProps extends cdk.StackProps {
  stage: string;
  /**
   * Confluence設定（オプショナル）
   */
  confluence?: {
    /**
     * Confluence Secret ARN
     */
    secretArn: string;
    /**
     * ConfluenceのホストURL
     */
    hostUrl: string;
    /**
     * 対象とするスペース
     */
    spaces: string[];
  };
}

export class AmazonBedrockKbStack extends cdk.Stack {
  public readonly vectorCollection: opensearchserverless.VectorCollection;

  constructor(scope: Construct, id: string, props: BedrockKbStackProps) {
    super(scope, id, props);

    const { stage, confluence } = props;

    const tag = `bedrock-kb-${stage}`;
    const bucketName = `${tag}-${this.account}`;

    // S3 bucket for the data source
    const dataSourceBucket = new aws_s3.Bucket(this, "DataSourceBucket", {
      bucketName: bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
      lifecycleRules: [
        {
          id: "delete-old-versions",
          noncurrentVersionExpiration: Duration.days(30),
        },
      ],
    });

    // S3 bucket for intermediate transformation storage
    const transformationBucket = new aws_s3.Bucket(
      this,
      "TransformationBucket",
      {
        bucketName: `${tag}-transformation-${this.account}`,
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        lifecycleRules: [
          {
            id: "delete-old-transformations",
            expiration: Duration.days(7), // 中間ファイルは7日後に削除
          },
        ],
      },
    );

    // OpenSearch Serverless Vector Collection
    this.vectorCollection = new opensearchserverless.VectorCollection(
      this,
      "VectorCollection",
      {
        collectionName: `${tag}-collection`,
        description: `Vector collection for ${stage} environment`,
        standbyReplicas:
          opensearchserverless.VectorCollectionStandbyReplicas.DISABLED, // コスト削減のため無効化
      },
    );

    // Custom chunking Lambda function
    const codeChunkingLambda = new nodejs.NodejsFunction(
      this,
      "CodeChunkingLambda",
      {
        entry: path.join(__dirname, "../lambda/code-chunking/index.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        timeout: Duration.minutes(5),
        memorySize: 1024,
        bundling: {
          nodeModules: [
            "tree-sitter",
            "tree-sitter-typescript",
            "tree-sitter-javascript",
            "tree-sitter-java",
            "tree-sitter-c-sharp",
          ],
          externalModules: ["@aws-sdk/client-s3"],
        },
        environment: {
          TRANSFORMATION_BUCKET: transformationBucket.bucketName,
        },
      },
    );

    // Grant permissions to Lambda
    dataSourceBucket.grantRead(codeChunkingLambda);
    transformationBucket.grantReadWrite(codeChunkingLambda);

    // Knowledge Base の作成（IAM roleは自動作成される）
    const knowledgeBase = new bedrock.VectorKnowledgeBase(
      this,
      "KnowledgeBase",
      {
        vectorStore: this.vectorCollection,
        embeddingsModel:
          bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
        name: `${tag}-knowledge-base`,
        description: `Knowledge base for ${stage} environment with OpenSearch Serverless`,
        instruction:
          "Use this knowledge base to answer questions based on the provided documents.",
      },
    );

    // Grant Bedrock Knowledge Base role access to transformation bucket
    transformationBucket.grantReadWrite(knowledgeBase.role);

    // Grant Bedrock reranking permission to the Knowledge Base role
    knowledgeBase.role.addToPrincipalPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ["bedrock:Rerank", "bedrock:InvokeModel"],
        resources: [
          // Allow reranking with any model (Rerank doesn't support resource-level permissions)
          "*",
        ],
      }),
    );

    // S3 Data Source with custom transformation
    knowledgeBase.addS3DataSource({
      bucket: dataSourceBucket,
      dataSourceName: `${tag}-s3-data-source`,
      chunkingStrategy: bedrock.ChunkingStrategy.NONE,
      customTransformation: bedrock.CustomTransformation.lambda({
        lambdaFunction: codeChunkingLambda,
        s3BucketUri: `s3://${transformationBucket.bucketName}/transformations/`,
      }),
    });

    // Confluence Data Source (if configured)
    if (confluence) {
      knowledgeBase.addConfluenceDataSource({
        dataSourceName: `${tag}-confluence-data-source`,
        confluenceUrl: confluence.hostUrl,
        authType:
          bedrock.ConfluenceDataSourceAuthType.OAUTH2_CLIENT_CREDENTIALS,
        authSecret: aws_secretsmanager.Secret.fromSecretCompleteArn(
          this,
          "ConfluenceSecret",
          confluence.secretArn,
        ),
        chunkingStrategy: bedrock.ChunkingStrategy.SEMANTIC,
        filters:
          confluence.spaces.length > 0
            ? [
                {
                  objectType: bedrock.ConfluenceObjectType.SPACE,
                  includePatterns: confluence.spaces,
                },
              ]
            : undefined,
      });
    }

    // Outputs
    new CfnOutput(this, "KnowledgeBaseId", {
      value: knowledgeBase.knowledgeBaseId,
      description: "Knowledge Base ID",
      exportName: `${tag}-kb-id`,
    });

    new CfnOutput(this, "KnowledgeBaseArn", {
      value: knowledgeBase.knowledgeBaseArn,
      description: "Knowledge Base ARN",
      exportName: `${tag}-kb-arn`,
    });

    new CfnOutput(this, "S3BucketName", {
      value: dataSourceBucket.bucketName,
      description: "S3 bucket name for data sources",
      exportName: `${tag}-s3-bucket`,
    });

    new CfnOutput(this, "VectorCollectionId", {
      value: this.vectorCollection.collectionId,
      description: "OpenSearch Serverless Collection ID",
      exportName: `${tag}-collection-id`,
    });

    new CfnOutput(this, "VectorCollectionEndpoint", {
      value: this.vectorCollection.collectionEndpoint,
      description: "OpenSearch Serverless Collection Endpoint",
    });

    new CfnOutput(this, "TransformationBucketName", {
      value: transformationBucket.bucketName,
      description: "S3 bucket name for transformation intermediate storage",
      exportName: `${tag}-transformation-bucket`,
    });

    new CfnOutput(this, "CodeChunkingLambdaArn", {
      value: codeChunkingLambda.functionArn,
      description: "Lambda function ARN for code chunking",
      exportName: `${tag}-chunking-lambda-arn`,
    });

    // Output the AWS CLI commands to upload files to the S3 bucket
    const uploadCommand = `aws s3 cp --recursive ./data s3://${bucketName}/documents/`;
    new CfnOutput(this, "UploadCommand", {
      value: uploadCommand,
      description: "AWS CLI command to upload files to the S3 bucket",
    });
  }
}
