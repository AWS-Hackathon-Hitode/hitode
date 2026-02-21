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
   * Video Search の設定
   */
  videoSearch?: {
    /**
     * SageMaker Processing Job のインスタンスタイプ
     */
    sagemakerInstanceType: string;
    /**
     * Bedrock Embedding モデルID
     */
    embeddingModelId: string;
    /**
     * Bedrock OCR モデルID (Claude Vision)
     */
    ocrModelId: string;
  };

  /**
   * Image Search の設定
   */
  imageSearch?: {
    /**
     * Bedrock VLM モデルID (Claude Vision)
     */
    vlmModelId: string;
    /**
     * Bedrock Embedding モデルID
     */
    embeddingModelId: string;
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
    imageSearch: {
      vlmModelId: "us.anthropic.claude-sonnet-4-20250514-v1:0",
      embeddingModelId: "amazon.titan-embed-text-v2:0",
    },
    // videoSearch は SageMakerCreateProcessingJob が CDK 2.225.0 未対応のため一時コメントアウト
    // videoSearch: {
    //   sagemakerInstanceType: "ml.m5.large",
    //   embeddingModelId: "amazon.titan-embed-text-v2:0",
    //   ocrModelId: "anthropic.claude-sonnet-4-20250514-v1:0",
    // },
    // bedrockKb は Docker が必要なため、必要時に有効化してください
    // bedrockKb: {
    //   embeddingModelArn:
    //     "arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.titan-embed-text-v1",
    //   aurora: {
    //     instanceType: "t3.medium",
    //     version: "16.4",
    //   },
    //   confluence: { ... },
    // },
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
