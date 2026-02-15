# Infrastructure

AWS CDK を使用した Bedrock KB ChatBot のインフラストラクチャ定義

## 📋 概要

このプロジェクトは、Amazon Bedrock Knowledge Base を中心としたチャットボットアプリケーションのインフラストラクチャを AWS CDK で定義しています。

## 🏗 構成コンポーネント

### Amazon Bedrock Knowledge Base
- **ベクトルストア**: Amazon OpenSearch Serverless
- **データソース**: Confluence Cloud（OAuth 2.0 認証）
- **埋め込みモデル**: Amazon Titan Embeddings

### データベース
- **Amazon Aurora PostgreSQL Serverless v2**
  - チャット履歴とユーザーデータの保存
  - VPC 内に配置
  - 自動スケーリング対応

### ネットワーク
- **VPC**: プライベートネットワーク環境
- **VPC Endpoints**: AWS サービスへのプライベート接続
- **Bastion Host**: VPC 内リソースへの安全なアクセス

### データ同期
- **AWS Lambda**: Confluence からのドキュメント同期
- **EventBridge**: 定期実行スケジューリング

## 📋 前提条件

- Node.js 20.x 以上
- pnpm 10.x 以上
- AWS CLI（設定済み）
- AWS アカウント
- Amazon Bedrock モデルアクセス（us-east-1 リージョンで有効化）
- Confluence Cloud アカウント（オプション）

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env` ファイルを作成し、Confluence の認証情報を設定します：

```bash
cp .env.example .env
```

`.env` ファイルを編集：

```bash
# Confluence Configuration
CONFLUENCE_HOST_URL=https://your-domain.atlassian.net
CONFLUENCE_SPACES=TECH,DOC,KB  # または "*" で全スペース
CONFLUENCE_APP_KEY=your-app-key
CONFLUENCE_APP_SECRET=your-app-secret
CONFLUENCE_ACCESS_TOKEN=your-access-token
CONFLUENCE_REFRESH_TOKEN=your-refresh-token
```

Confluence OAuth 2.0 アプリの作成方法は [Atlassian のドキュメント](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/) を参照してください。

### 3. TypeScript のビルド

```bash
pnpm build
```

### 4. CDK のブートストラップ

初回のみ実行が必要です：

```bash
pnpm cdk bootstrap
```

### 5. デプロイ

```bash
pnpm cdk deploy
```

デプロイ完了後、以下の情報が出力されます：
- Knowledge Base ID
- Aurora PostgreSQL エンドポイント
- Bastion Host のインスタンス ID

## 📝 開発コマンド

```bash
pnpm build      # TypeScript のビルド
pnpm watch      # ファイル変更の監視とビルド
pnpm test       # Jest によるテスト実行
pnpm cdk synth  # CloudFormation テンプレートの生成
pnpm cdk deploy # AWS へのデプロイ
pnpm cdk diff   # 変更内容の確認
pnpm cdk destroy # リソースの削除
pnpm lint       # Biome によるコード検査
pnpm format     # Biome によるコードフォーマット
```

## 🗂 プロジェクト構成

```
infra/
├── bin/
│   └── infra.ts              # CDK エントリーポイント
├── lib/
│   ├── constructs/           # 再利用可能な Construct
│   └── stacks/               # CDK スタック定義
├── test/                     # テストファイル
├── cdk.json                  # CDK 設定
├── package.json              # 依存関係
└── .env.example              # 環境変数のサンプル
```

## 🔧 運用

### Bastion Host への接続

VPC 内のリソース（Aurora など）にアクセスする場合：

```bash
# インスタンス ID の取得
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=BastionHost" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text

# Session Manager で接続
aws ssm start-session --target <instance-id>

# PostgreSQL への接続（Bastion Host 内から）
psql -h <aurora-endpoint> -U postgres -d chatbot
```

### Knowledge Base の同期

Confluence からのドキュメント同期は Lambda 関数で自動実行されます。手動で同期する場合：

```bash
aws lambda invoke \
  --function-name <function-name> \
  --payload '{}' \
  response.json
```

## 🔐 セキュリティ

- すべての機密情報は AWS Secrets Manager に保存
- VPC 内のリソースはプライベートサブネットに配置
- Bastion Host は SSM Session Manager 経由でのみアクセス可能
- IAM ロールによる最小権限の原則を適用

## 📊 コスト最適化

- Aurora Serverless v2 による自動スケーリング
- OpenSearch Serverless による使用量ベースの課金
- Lambda の実行時間の最適化
- 不要なリソースの自動削除設定

## 🐛 トラブルシューティング

### デプロイエラー

```bash
# スタックの状態を確認
pnpm cdk diff

# 詳細なログを表示してデプロイ
pnpm cdk deploy --verbose
```

### Knowledge Base の同期エラー

CloudWatch Logs で Lambda 関数のログを確認：

```bash
aws logs tail /aws/lambda/<function-name> --follow
```

## 📚 参考資料

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
- [Amazon Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [Confluence OAuth 2.0](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/)
