import * as cdk from "aws-cdk-lib";
import { aws_ec2, aws_iam, aws_ssm, CfnOutput } from "aws-cdk-lib";
import type { Construct } from "constructs";

interface BastionStackProps extends cdk.StackProps {
  stage: string;
  /**
   * Aurora Secret ARN
   */
  auroraSecretArn: string;
}

export class BastionStack extends cdk.Stack {
  public readonly bastionInstance: aws_ec2.Instance;

  constructor(scope: Construct, id: string, props: BastionStackProps) {
    super(scope, id, props);

    const { stage, auroraSecretArn } = props;

    const tag = `bedrock-kb-${stage}`;

    // SSM から VPC ID を取得
    const vpcId = aws_ssm.StringParameter.valueFromLookup(
      this,
      `/${tag}/vpc-id`,
    );

    // VPC ID から IVpc を取得
    const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: vpcId,
    });

    // Bastion Host用のセキュリティグループ
    const bastionSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      "BastionSecurityGroup",
      {
        vpc,
        description: "Security group for Bastion Host",
        allowAllOutbound: true, // すべてのアウトバウンドを許可
      },
    );

    // Note: Aurora はすでに VPC CIDR からの接続を許可しているため、
    // Bastion からの接続も自動的に許可される (BedrockKbStack で設定済み)

    // IAM Role for Bastion Host (SSM Session Manager用)
    const bastionRole = new aws_iam.Role(this, "BastionRole", {
      roleName: `${tag}-bastion-role`,
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        // SSM Session Manager用のポリシー
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
      ],
      inlinePolicies: {
        BastionPolicy: new aws_iam.PolicyDocument({
          statements: [
            // Aurora Secret への読み取りアクセス
            new aws_iam.PolicyStatement({
              resources: ["*"],
              actions: ["secretsmanager:GetSecretValue"],
            }),
            // KMS復号化権限
            new aws_iam.PolicyStatement({
              resources: ["*"],
              actions: ["kms:Decrypt"],
              conditions: {
                StringEquals: {
                  "kms:ViaService": [
                    `secretsmanager.${this.region}.amazonaws.com`,
                  ],
                },
              },
            }),
          ],
        }),
      },
    });

    // User Data - PostgreSQL クライアントのインストール
    const userData = aws_ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -e",
      "",
      "# システムアップデート",
      "yum update -y",
      "",
      "# PostgreSQL 16 クライアントのインストール",
      "dnf install -y postgresql16",
      "",
      "# AWS CLI v2 のインストール（最新版）",
      "curl 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o 'awscliv2.zip'",
      "unzip awscliv2.zip",
      "./aws/install",
      "rm -rf aws awscliv2.zip",
      "",
      "# jq のインストール（JSON パース用）",
      "yum install -y jq",
      "",
      "# 接続用のヘルパースクリプトを作成",
      "cat > /usr/local/bin/connect-aurora.sh << 'EOF'",
      "#!/bin/bash",
      "# Aurora PostgreSQL への接続スクリプト",
      "",
      `SECRET_ARN="${auroraSecretArn}"`,
      "",
      "# Secrets Manager からクレデンシャルとホスト情報を取得",
      'echo "Fetching credentials from Secrets Manager..."',
      "SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id $SECRET_ARN --query SecretString --output text)",
      "",
      "HOST=$(echo $SECRET_JSON | jq -r .host)",
      "PORT=$(echo $SECRET_JSON | jq -r .port)",
      "USERNAME=$(echo $SECRET_JSON | jq -r .username)",
      "PASSWORD=$(echo $SECRET_JSON | jq -r .password)",
      "DATABASE=$(echo $SECRET_JSON | jq -r .dbname)",
      "",
      'echo "Connecting to Aurora PostgreSQL..."',
      'echo "Host: $HOST"',
      'echo "Port: $PORT"',
      'echo "Database: $DATABASE"',
      'echo "Username: $USERNAME"',
      'echo ""',
      "",
      "# 環境変数にパスワードを設定して psql を実行",
      "PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USERNAME -d $DATABASE",
      "EOF",
      "",
      "chmod +x /usr/local/bin/connect-aurora.sh",
      "",
      "# README を作成",
      "cat > /home/ec2-user/README.txt << 'EOF'",
      "=====================================",
      "Aurora PostgreSQL 接続方法",
      "=====================================",
      "",
      "1. Aurora に接続:",
      "   sudo /usr/local/bin/connect-aurora.sh",
      "",
      "2. Secrets Manager から認証情報を取得:",
      `   aws secretsmanager get-secret-value --secret-id ${auroraSecretArn} --query SecretString --output text | jq`,
      "",
      "   返却される情報:",
      "   - host: Aurora cluster endpoint",
      "   - port: ポート番号 (通常 5432)",
      "   - username: データベースユーザー名",
      "   - password: データベースパスワード",
      "   - dbname: データベース名",
      "",
      "3. 手動で接続する場合:",
      "   上記のコマンドで取得した情報を使用:",
      "   PGPASSWORD='<password>' psql -h <host> -p <port> -U <username> -d <dbname>",
      "",
      "4. pgvector 拡張の確認:",
      "   接続後、以下のコマンドを実行:",
      "   SELECT * FROM pg_extension WHERE extname = 'vector';",
      "",
      "5. Bedrock Knowledge Base用のテーブル確認:",
      "   \\dt bedrock_integration.*",
      "   SELECT count(*) FROM bedrock_integration.bedrock_kb;",
      "EOF",
      "",
      "chown ec2-user:ec2-user /home/ec2-user/README.txt",
    );

    // Bastion Host (Amazon Linux 2023) - プライベートサブネットに配置
    // Note: VPC Endpoints for SSM are created in NetworkStack
    this.bastionInstance = new aws_ec2.Instance(this, "BastionInstance", {
      instanceName: `${tag}-bastion`,
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.T3,
        aws_ec2.InstanceSize.MICRO,
      ),
      machineImage: aws_ec2.MachineImage.latestAmazonLinux2023({
        cachedInContext: false,
      }),
      vpc,
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS, // プライベートサブネットに配置
      },
      securityGroup: bastionSecurityGroup,
      role: bastionRole,
      userData: userData,
      // プライベートサブネット + VPC Endpoint でSSM接続するため、パブリックIPは不要
      associatePublicIpAddress: false,
      ssmSessionPermissions: true,
    });

    // Outputs
    new CfnOutput(this, "BastionInstanceId", {
      value: this.bastionInstance.instanceId,
      description: "Bastion Host Instance ID",
      exportName: `${tag}-bastion-instance-id`,
    });

    new CfnOutput(this, "SSMConnectCommand", {
      value: `aws ssm start-session --target ${this.bastionInstance.instanceId}`,
      description: "SSM Session Manager connection command",
    });

    new CfnOutput(this, "AuroraConnectCommand", {
      value: "sudo /usr/local/bin/connect-aurora.sh",
      description:
        "Command to connect to Aurora PostgreSQL (run after SSM connection)",
    });

    new CfnOutput(this, "AuroraSecretCommand", {
      value: `aws secretsmanager get-secret-value --secret-id ${auroraSecretArn} --query SecretString --output text | jq`,
      description: "Command to get Aurora credentials from Secrets Manager",
    });
  }
}
