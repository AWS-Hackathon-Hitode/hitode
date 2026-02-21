import * as cdk from "aws-cdk-lib";
import * as sagemaker from "aws-cdk-lib/aws-sagemaker";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

// 1. Props インターフェースの定義 (CDKの基本)
interface SageMakerStackProps extends cdk.StackProps {
  stage: string;
}

export class SageMakerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SageMakerStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // 2. 実行用ロールの作成（もし既存のものを使い回さない場合）
    const sagemakerRole = new iam.Role(this, "SageMakerExecutionRole", {
      assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com"),
    });
    sagemakerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess")
    );

    // --- ここにご提示いただいたコードを挿入 ---

    // 1. SageMaker Model の作成
    const model = new sagemaker.CfnModel(this, 'ImageAnalysisModel', {
      executionRoleArn: sagemakerRole.roleArn,
      primaryContainer: {
        // 'image:' というキーが必要です
        image: '763104351884.dkr.ecr.us-east-1.amazonaws.com/huggingface-pytorch-inference:2.6.0-transformers4.51.3-gpu-py312-cu124-ubuntu22.04',
        // 'environment:' というキーで囲む必要があります
        environment: {
          'HF_MODEL_ID': 'Salesforce/blip-image-captioning-large',
          'HF_TASK': 'image-to-text',
        },
      },
    });

    // 2. Endpoint Configuration
    const endpointConfig = new sagemaker.CfnEndpointConfig(this, 'ImageEndpointConfig', {
      productionVariants: [{
        initialInstanceCount: 1,
        instanceType: 'ml.g4dn.xlarge',
        modelName: model.attrModelName,
        variantName: 'AllTraffic',
      }],
    });

    // 3. Endpoint
    const endpoint = new sagemaker.CfnEndpoint(this, 'ImageEndpoint', {
      endpointConfigName: endpointConfig.attrEndpointConfigName,
      endpointName: `Image-Realtime-Endpoint-${stage}`,
    });
  }
}