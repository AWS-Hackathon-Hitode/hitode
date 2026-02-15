# Amazon Bedrock Knowledge Base スタック

## 概要

このスタックは、Amazon Bedrock Knowledge Base を作成し、以下のコンポーネントを含みます：

- **VPC**: 新規作成されたVPC内にすべてのリソースを配置
- **Amazon Aurora PostgreSQL**: pgvector拡張を使用したベクトルデータベース
- **S3データソース**: ドキュメントとナレッジファイルの保存
- **Confluenceデータソース**: チームドキュメンテーション（プレビュー機能）

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                         VPC                             │
│  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Public Subnet  │  │ Private Subnet  │             │
│  │                 │  │                 │             │
│  │   NAT Gateway   │  │  VPC Endpoints  │             │
│  └─────────────────┘  │  - Bedrock      │             │
│                       │  - Bedrock Runtime             │
│  ┌─────────────────┐  └─────────────────┘             │
│  │Isolated Subnet  │                                   │
│  │                 │                                   │
│  │ Aurora          │                                   │
│  │ PostgreSQL      │                                   │
│  └─────────────────┘                                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────┐  ┌─────────────────────┐
│  S3 Data Source     │  │ Confluence Source   │
│                     │  │   (Optional)        │
└─────────────────────┘  └─────────────────────┘
           │                        │
           └────────────┬───────────┘
                       ▼
            ┌──────────────────────┐
            │  Bedrock Knowledge   │
            │       Base           │
            └──────────────────────┘
```

## 環境設定

環境固有の設定は `lib/config/environmental_config.ts` で管理されています：

```typescript
bedrockKb: {
  embeddingModelArn: string,        // 埋め込みモデルのARN
  aurora: {
    instanceType: string,           // インスタンスタイプ (例: "t3.medium")
    version: string,                // PostgreSQLバージョン (例: "15.4")
  },
  confluence?: {
    secretArn: string,              // Confluence認証情報のSecrets Manager ARN
    hostUrl: string,                // ConfluenceのURL
    spaces: string[],               // 対象スペース
  }
}
```

## デプロイ方法

1. 環境変数の設定（Confluenceを使用する場合）:

   ```bash
   export CONFLUENCE_SECRET_ARN="arn:aws:secretsmanager:region:account:secret:name"
   export CONFLUENCE_HOST_URL="https://your-domain.atlassian.net"
   ```

2. スタックのデプロイ:

   ```bash
   cd infra
   npm run build

   # 開発環境にデプロイ (デフォルト)
   npx cdk deploy BedrockKbStackDev -c env=dev

   # 本番環境にデプロイ
   npx cdk deploy BedrockKbStackProd -c env=prod
   ```

   または、cdk コマンドを直接使用:

   ```bash
   npm run cdk -- deploy BedrockKbStackDev -c env=dev
   ```

3. S3にドキュメントをアップロード:

   ```bash
   # デプロイ後に表示されるコマンドを使用
   aws s3 cp --recursive ./data s3://bedrock-kb-dev-[account]/documents/
   ```

4. Knowledge Baseの同期:
   ```bash
   # デプロイ後に表示されるコマンドを使用
   aws bedrock start-ingestion-job --knowledge-base-id [kb-id] --data-source-id [ds-id]
   ```

## 主要な機能

### VPC設定

- パブリック、プライベート、分離されたサブネットを含む3層構造
- Bedrock用のVPCエンドポイント
- NATゲートウェイによるアウトバウンド接続

### Aurora PostgreSQL

- pgvector拡張対応
- Data API有効化
- 自動バックアップと削除保護（開発環境では無効）
- リーダーインスタンスを含む高可用性構成

### S3データソース

- バージョニング有効
- ライフサイクルポリシーによる古いバージョンの自動削除
- ドキュメントとナレッジファイル用のプレフィックス設定

### Confluenceデータソース（オプション）

- Basic認証対応
- スペース単位でのフィルタリング
- プレビュー機能として利用可能

## セキュリティ

- Aurora PostgreSQLへのアクセスはVPC内からのみ許可
- IAMロールによる最小権限の原則
- Secrets Managerによるパスワード管理
- VPCエンドポイントによるプライベート接続

## 出力値

デプロイ後、以下の情報がCloudFormation出力として利用可能：

- Knowledge Base ID
- Knowledge Base ARN
- S3バケット名
- VPC ID
- Aurora クラスターエンドポイント
- データアップロード用コマンド
- 同期コマンド

## トラブルシューティング

### VPCのアベイラビリティゾーン取得エラー

適切なIAM権限（`ec2:DescribeAvailabilityZones`）が必要です。

### Aurora接続エラー

- セキュリティグループの設定を確認
- VPC内からの接続であることを確認
- pgvector拡張のインストールを確認

### Confluenceデータソースエラー

- Secrets Managerに正しい認証情報が設定されていることを確認
- Confluenceのホストアクセスが可能であることを確認
