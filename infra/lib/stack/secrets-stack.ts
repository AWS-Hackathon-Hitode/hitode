import * as cdk from "aws-cdk-lib";
import { aws_secretsmanager, CfnOutput, SecretValue } from "aws-cdk-lib";
import type { Construct } from "constructs";

interface SecretsStackProps extends cdk.StackProps {
  stage: string;
  /**
   * Confluence認証情報
   */
  confluence?: {
    /**
     * ConfluenceのClient ID (App Key)
     */
    confluenceAppKey?: string;
    /**
     * ConfluenceのClient Secret (App Secret)
     */
    confluenceAppSecret?: string;
    /**
     * ConfluenceのAccess Token
     */
    confluenceAccessToken?: string;
    /**
     * ConfluenceのRefresh Token
     */
    confluenceRefreshToken?: string;
  };
}

export class SecretsStack extends cdk.Stack {
  public readonly confluenceSecretArn?: string;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { stage, confluence } = props;
    const tag = `bedrock-kb-${stage}`;

    // Confluence Secret (オプショナル)
    if (confluence) {
      const confluenceSecret = new aws_secretsmanager.Secret(
        this,
        "ConfluenceSecret",
        {
          secretName: `${tag}-confluence-credentials`,
          description: "Confluence credentials for Bedrock Knowledge Base",
          secretObjectValue: {
            confluenceAppKey: SecretValue.unsafePlainText(
              confluence.confluenceAppKey ?? "",
            ),
            confluenceAppSecret: SecretValue.unsafePlainText(
              confluence.confluenceAppSecret ?? "",
            ),
            confluenceAccessToken: SecretValue.unsafePlainText(
              confluence.confluenceAccessToken ?? "",
            ),
            confluenceRefreshToken: SecretValue.unsafePlainText(
              confluence.confluenceRefreshToken ?? "",
            ),
          },
        },
      );

      this.confluenceSecretArn = confluenceSecret.secretArn;

      // Output for Confluence secret
      new CfnOutput(this, "ConfluenceSecretArn", {
        value: confluenceSecret.secretArn,
        description: "Confluence credentials secret ARN",
        exportName: `${tag}-confluence-secret-arn`,
      });

      new CfnOutput(this, "ConfluenceSecretUpdateCommand", {
        value: `aws secretsmanager update-secret --secret-id ${confluenceSecret.secretArn} --secret-string '{"confluenceAppKey":"your-app-key","confluenceAppSecret":"your-app-secret","confluenceAccessToken":"your-access-token","confluenceRefreshToken":"your-refresh-token"}'`,
        description: "Command to update Confluence credentials",
      });
    }
  }
}
