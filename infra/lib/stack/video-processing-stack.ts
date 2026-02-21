import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import type { Construct } from "constructs";
import type { EnvironmentConfig } from "../config/environmental_config";
import * as path from "node:path";

interface VideoProcessingStackProps extends cdk.StackProps {
  stage: string;
  config: NonNullable<EnvironmentConfig["videoSearch"]>;
  bucket: s3.IBucket;
}

export class VideoProcessingStack extends cdk.Stack {
  public readonly ecrRepository: ecr.Repository;
  public readonly stateMachine: sfn.StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: VideoProcessingStackProps,
  ) {
    super(scope, id, props);

    const tag = `video-search-${props.stage}`;

    // ===== ECR =====
    this.ecrRepository = new ecr.Repository(this, "WhisperRepo", {
      repositoryName: `${tag}-whisper`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        { maxImageCount: 3, description: "Keep only 3 latest images" },
      ],
    });

    // ===== SageMaker Processing Job 実行ロール =====
    const processingRole = new iam.Role(this, "SageMakerProcessingRole", {
      roleName: `${tag}-sagemaker-processing`,
      assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com"),
    });
    props.bucket.grantReadWrite(processingRole);
    this.ecrRepository.grantPull(processingRole);
    processingRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess"),
    );

    // ===== OCR Lambda =====
    const ocrLambda = new lambdaNodejs.NodejsFunction(this, "OcrLambda", {
      functionName: `${tag}-ocr`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/ocr/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        BUCKET: props.bucket.bucketName,
        OCR_MODEL_ID: props.config.ocrModelId,
      },
      bundling: { externalModules: ["@aws-sdk/*"] },
    });
    props.bucket.grantReadWrite(ocrLambda);
    ocrLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${props.config.ocrModelId}`,
        ],
      }),
    );

    // ===== Glue Job（チャンキング） =====
    const glueRole = new iam.Role(this, "GlueChunkingRole", {
      roleName: `${tag}-glue-chunking`,
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
    });
    props.bucket.grantReadWrite(glueRole);
    glueRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSGlueServiceRole",
      ),
    );

    const glueScriptAsset = new s3assets.Asset(this, "GlueChunkingScript", {
      path: path.join(__dirname, "../glue/chunking.py"),
    });
    glueScriptAsset.grantRead(glueRole);

    const glueJob = new glue.CfnJob(this, "ChunkingJob", {
      name: `${tag}-chunking`,
      role: glueRole.roleArn,
      command: {
        name: "pythonshell",
        pythonVersion: "3.9",
        scriptLocation: glueScriptAsset.s3ObjectUrl,
      },
      defaultArguments: {
        "--BUCKET": props.bucket.bucketName,
        "--additional-python-modules": "boto3",
      },
      maxCapacity: 0.0625, // 1/16 DPU (最小)
      glueVersion: "3.0",
    });

    // ===== Embedding Lambda =====
    const embeddingLambda = new lambdaNodejs.NodejsFunction(
      this,
      "EmbeddingLambda",
      {
        functionName: `${tag}-embedding`,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(__dirname, "../lambda/embedding/index.ts"),
        handler: "handler",
        timeout: cdk.Duration.minutes(15),
        memorySize: 1024,
        environment: {
          BUCKET: props.bucket.bucketName,
          EMBEDDING_MODEL_ID: props.config.embeddingModelId,
        },
        bundling: { externalModules: ["@aws-sdk/*"] },
      },
    );
    props.bucket.grantReadWrite(embeddingLambda);
    embeddingLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${props.config.embeddingModelId}`,
        ],
      }),
    );

    // ===== Search Lambda + API Gateway =====
    const searchLambda = new lambdaNodejs.NodejsFunction(
      this,
      "SearchLambda",
      {
        functionName: `${tag}-search`,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(__dirname, "../lambda/search/index.ts"),
        handler: "handler",
        timeout: cdk.Duration.seconds(30),
        memorySize: 1024,
        environment: {
          BUCKET: props.bucket.bucketName,
          EMBEDDING_MODEL_ID: props.config.embeddingModelId,
        },
        bundling: { externalModules: ["@aws-sdk/*"] },
      },
    );
    props.bucket.grantRead(searchLambda);
    searchLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${props.config.embeddingModelId}`,
        ],
      }),
    );

    const api = new apigateway.RestApi(this, "VideoSearchApi", {
      restApiName: `${tag}-api`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const searchResource = api.root.addResource("search");
    searchResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(searchLambda),
    );

    // ===== Step Functions: フルパイプライン =====

    // Step 1: SageMaker Processing Job（Whisper + FFmpeg）
    const sagemakerStep = new tasks.SageMakerCreateProcessingJob(
      this,
      "WhisperProcessing",
      {
        processingJobName: sfn.JsonPath.format(
          "video-{}-{}",
          sfn.JsonPath.stringAt("$.videoId"),
          sfn.JsonPath.stringAt("$$.Execution.Name"),
        ),
        role: processingRole,
        appSpecification: {
          imageUri: `${this.ecrRepository.repositoryUri}:latest`,
        },
        processingResources: {
          clusterConfig: {
            instanceCount: 1,
            instanceType: ec2.InstanceType.of(
              ec2.InstanceClass.M5,
              ec2.InstanceSize.LARGE,
            ),
            volumeSizeInGb: 50,
          },
        },
        processingInputs: [
          {
            inputName: "input",
            s3Input: {
              s3Uri: sfn.JsonPath.format(
                "s3://{}/raw-videos/{}/",
                sfn.JsonPath.stringAt("$.bucket"),
                sfn.JsonPath.stringAt("$.videoId"),
              ),
              localPath: "/opt/ml/processing/input",
              s3DataType: tasks.S3DataType.S3_PREFIX,
              s3InputMode: tasks.S3InputMode.FILE,
            },
          },
        ],
        processingOutputConfig: {
          outputs: [
            {
              outputName: "output",
              s3Output: {
                s3Uri: sfn.JsonPath.format(
                  "s3://{}/processed/{}/",
                  sfn.JsonPath.stringAt("$.bucket"),
                  sfn.JsonPath.stringAt("$.videoId"),
                ),
                localPath: "/opt/ml/processing/output",
                s3UploadMode: tasks.S3UploadMode.END_OF_JOB,
              },
            },
          ],
        },
        stoppingCondition: {
          maxRuntime: cdk.Duration.hours(1),
        },
        resultPath: "$.sagemakerResult",
      },
    );

    // Step 2: OCR Lambda
    const ocrStep = new tasks.LambdaInvoke(this, "SlideOcr", {
      lambdaFunction: ocrLambda,
      payload: sfn.TaskInput.fromObject({
        videoId: sfn.JsonPath.stringAt("$.videoId"),
      }),
      resultPath: "$.ocrResult",
    });

    // Step 3: Glue Job（チャンキング）
    const glueStep = new tasks.GlueStartJobRun(this, "Chunking", {
      glueJobName: glueJob.name!,
      arguments: sfn.TaskInput.fromObject({
        "--VIDEO_ID": sfn.JsonPath.stringAt("$.videoId"),
      }),
      resultPath: "$.glueResult",
    });

    // Step 4: Embedding Lambda
    const embeddingStep = new tasks.LambdaInvoke(this, "Embedding", {
      lambdaFunction: embeddingLambda,
      payload: sfn.TaskInput.fromObject({
        videoId: sfn.JsonPath.stringAt("$.videoId"),
      }),
      resultPath: "$.embeddingResult",
    });

    // パイプライン: SageMaker → OCR → Glue → Embedding
    const definition = sagemakerStep
      .next(ocrStep)
      .next(glueStep)
      .next(embeddingStep);

    this.stateMachine = new sfn.StateMachine(this, "VideoProcessingPipeline", {
      stateMachineName: `${tag}-pipeline`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.hours(2),
    });

    // ===== Upload トリガー Lambda =====
    const uploadTrigger = new lambdaNodejs.NodejsFunction(
      this,
      "UploadTrigger",
      {
        functionName: `${tag}-upload-trigger`,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(__dirname, "../lambda/upload-trigger/index.ts"),
        handler: "handler",
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: {
          STATE_MACHINE_ARN: this.stateMachine.stateMachineArn,
        },
        bundling: { externalModules: ["@aws-sdk/*"] },
      },
    );
    this.stateMachine.grantStartExecution(uploadTrigger);

    props.bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(uploadTrigger),
      { prefix: "raw-videos/", suffix: ".mp4" },
    );

    // ===== Outputs =====
    new cdk.CfnOutput(this, "StateMachineArn", {
      value: this.stateMachine.stateMachineArn,
    });

    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: api.url,
      description: "Video Search API endpoint",
    });

    new cdk.CfnOutput(this, "SearchUrl", {
      value: `curl -X POST ${api.url}search -H 'Content-Type: application/json' -d '{"query":"検索クエリ"}'`,
      description: "Example search command",
    });

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: this.ecrRepository.repositoryUri,
    });

    new cdk.CfnOutput(this, "DockerBuildAndPush", {
      value: [
        `docker build -t ${this.ecrRepository.repositoryUri}:latest`,
        ` ${path.resolve(__dirname, "../sagemaker/whisper")}`,
        ` && aws ecr get-login-password --region ${this.region}`,
        ` | docker login --username AWS --password-stdin ${this.account}.dkr.ecr.${this.region}.amazonaws.com`,
        ` && docker push ${this.ecrRepository.repositoryUri}:latest`,
      ].join(""),
    });
  }
}
