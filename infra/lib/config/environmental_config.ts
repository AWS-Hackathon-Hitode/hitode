import * as dotenv from "dotenv";

dotenv.config();

/**
 * 環境設定の型定義
 */
export interface EnvironmentConfig {
  /**
   * VPCの設定
   */
  vpc: {
    /**
     * VPCのCIDRブロック
     */
    cidr: string;
    /**
     * 使用する最大アベイラビリティゾーン数
     */
    maxAzs: number;
  };

  /**
   * Bedrock Knowledge Base の設定
   */
  bedrockKb?: {
    /**
     * 埋め込みモデルのARN
     */
    embeddingModelArn: string;
    /**
     * Aurora PostgreSQL の設定
     */
    aurora: {
      /**
       * インスタンスタイプ
       */
      instanceType: string;
      /**
       * PostgreSQLのバージョン
       */
      version: string;
    };
    /**
     * Confluence の設定
     */
    confluence?: {
      /**
       * ConfluenceのClient ID
       */
      confluenceAppKey: string;
      /**
       * ConfluenceのClient Secret
       */
      confluenceAppSecret: string;
      /**
       * ConfluenceのAccess Token
       */
      confluenceAccessToken: string;
      /**
       * ConfluenceのRefresh Token
       */
      confluenceRefreshToken: string;
      /**
       * ConfluenceのホストURL
       */
      hostUrl: string;
      /**
       * 対象とするスペース
       */
      spaces: string[];
    };
  };
}

/**
 * 環境別の設定を生成する関数
 */
const environmentConfigs: { [key: string]: EnvironmentConfig } = {
  test: {
    vpc: {
      cidr: "10.0.0.0/16",
      maxAzs: 2,
    },
    bedrockKb: {
      embeddingModelArn:
        "arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.titan-embed-text-v1",
      aurora: {
        instanceType: "t3.medium",
        version: "16.4",
      },
      confluence: {
        confluenceAppKey: process.env.CONFLUENCE_APP_KEY ?? "",
        confluenceAppSecret: process.env.CONFLUENCE_APP_SECRET ?? "",
        confluenceAccessToken: process.env.CONFLUENCE_ACCESS_TOKEN ?? "",
        confluenceRefreshToken: process.env.CONFLUENCE_REFRESH_TOKEN ?? "",
        hostUrl: process.env.CONFLUENCE_HOST_URL ?? "",
        spaces:
          process.env.CONFLUENCE_SPACES?.split(",").filter(
            (s) => s.trim() !== "",
          ) || [],
      },
    },
  },
};

/**
 * 指定された環境の設定を取得する
 *
 * @param stage - 環境名（'dev', 'prod' など）
 * @returns 指定された環境の設定
 * @throws 指定された環境が存在しない場合はエラー
 *
 * @example
 * ```typescript
 * const config = getConfig('dev');
 * console.log(config.vpc.cidr); // '10.0.0.0/16'
 * console.log(config.envName); // 'dev'
 * ```
 */
export function getConfig(stage: string): EnvironmentConfig {
  const config = environmentConfigs[stage];
  if (!config) {
    throw new Error(`Unknown environment: ${stage}`);
  }
  return config;
}
