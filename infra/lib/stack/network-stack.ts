import * as cdk from "aws-cdk-lib";
import { aws_ec2, aws_ssm } from "aws-cdk-lib";
import type { Construct } from "constructs";

interface NetworkStackProps extends cdk.StackProps {
  stage: string;
  /**
   * VPCのCIDRブロック
   */
  vpcCidr: string;
  /**
   * 使用する最大アベイラビリティゾーン数
   */
  maxAzs: number;
}

export class NetworkStack extends cdk.Stack {
  // VPC は SSM Parameter Store に格納するため public export は不要

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { stage, vpcCidr, maxAzs } = props;
    const tag = `bedrock-kb-${stage}`;

    // VPC の作成
    const vpc = new aws_ec2.Vpc(this, "BedrockKbVpc", {
      vpcName: `${tag}-vpc`,
      ipAddresses: aws_ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: maxAzs,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: aws_ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "private",
          subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: "isolated",
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // VPC Endpoints for SSM Session Manager (Bastion Host用)
    new aws_ec2.InterfaceVpcEndpoint(this, "SSMEndpoint", {
      vpc: vpc,
      service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    new aws_ec2.InterfaceVpcEndpoint(this, "SSMMessagesEndpoint", {
      vpc: vpc,
      service: aws_ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    new aws_ec2.InterfaceVpcEndpoint(this, "EC2MessagesEndpoint", {
      vpc: vpc,
      service: aws_ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      subnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // // VPC Endpoint for Bedrock
    // new aws_ec2.InterfaceVpcEndpoint(this, "BedrockEndpoint", {
    //   vpc: vpc,
    //   service: aws_ec2.InterfaceVpcEndpointAwsService.BEDROCK,
    //   subnets: {
    //     subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
    //   },
    // });

    // // VPC Endpoint for Bedrock Runtime
    // new aws_ec2.InterfaceVpcEndpoint(this, "BedrockRuntimeEndpoint", {
    //   vpc: vpc,
    //   service: aws_ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
    //   subnets: {
    //     subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
    //   },
    // });

    // // VPC Endpoint for Secrets Manager (Aurora VectorStore Custom Resource用)
    // new aws_ec2.InterfaceVpcEndpoint(this, "SecretsManagerEndpoint", {
    //   vpc: vpc,
    //   service: aws_ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    //   subnets: {
    //     subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
    //   },
    // });

    // // VPC Endpoint for RDS Data API (Aurora VectorStore Custom Resource用)
    // new aws_ec2.InterfaceVpcEndpoint(this, "RDSDataEndpoint", {
    //   vpc: vpc,
    //   service: aws_ec2.InterfaceVpcEndpointAwsService.RDS_DATA,
    //   subnets: {
    //     subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
    //   },
    // });

    // VPC ID を SSM Parameter Store に格納
    new aws_ssm.StringParameter(this, "VpcIdParameter", {
      parameterName: `/${tag}/vpc-id`,
      stringValue: vpc.vpcId,
      description: `VPC ID for ${stage} environment`,
    });

    // Outputs
    new cdk.CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      description: "VPC ID for Bedrock KB infrastructure",
      exportName: `${tag}-vpc-id`,
    });

    new cdk.CfnOutput(this, "VpcCidr", {
      value: vpc.vpcCidrBlock,
      description: "VPC CIDR block",
      exportName: `${tag}-vpc-cidr`,
    });
  }
}
