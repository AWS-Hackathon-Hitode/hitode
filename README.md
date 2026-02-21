# Bedrock KB ChatBot

Amazon Bedrock Knowledge Base を活用した AI チャットボットアプリケーション

## 🎯 概要

Bedrock KB ChatBot は、Amazon Bedrock の Knowledge Base 機能を活用して構築された AI チャットボットです。Vercel AI Chatbot テンプレートをベースにした Next.js フロントエンドと、AWS CDK によるインフラストラクチャで、モダンでスケーラブルなアーキテクチャを実現しています。

## 🚀 主な機能

- Amazon Bedrock Knowledge Base との統合
- Confluence からのドキュメント同期
- リアルタイムチャット機能（AI SDK & Vercel AI Gateway）
- レスポンシブデザイン
- 認証機能（Auth.js）
- チャット履歴の保存（PostgreSQL）
- ファイルストレージ（Vercel Blob）
- TypeScript による型安全性

## 🏗 アーキテクチャ

システム構成図: [doc/architecture.dio.svg](./doc/architecture.dio.svg)

### 主要コンポーネント

- **Web アプリケーション**: Next.js 16 + Vercel AI SDK
- **データソース**: Confluence（OAuth 2.0 認証）
- **ベクトルストア**: Amazon OpenSearch Serverless
- **ナレッジベース**: Amazon Bedrock Knowledge Bases
- **データベース**: Amazon Aurora PostgreSQL（チャット履歴）
- **運用**: Bastion Host（VPC 内リソースへのアクセス）

## 🛠 技術スタック

### Web アプリケーション
- **Next.js 16** - React フレームワーク
- **React 19** - UI ライブラリ
- **AI SDK** - LLM 統合ライブラリ
- **Vercel AI Gateway** - AI モデルプロバイダーへの統合インターフェース
- **Tailwind CSS 4** - CSS フレームワーク
- **TypeScript 5** - 型付き JavaScript
- **Biome** - Linter & Formatter
- **Auth.js** - 認証
- **Drizzle ORM** - データベース ORM
- **Vercel Blob** - ファイルストレージ
- **Redis** - キャッシュ

### インフラストラクチャ
- **AWS CDK** - Infrastructure as Code
- **Amazon Bedrock** - AI/ML サービス
- **Amazon OpenSearch Serverless** - ベクトルストア
- **Amazon Aurora PostgreSQL** - データベース
- **AWS Lambda** - サーバーレス関数（Confluence 同期）
- **TypeScript** - CDK の実装言語

## 📋 前提条件

- Node.js 20.x 以上
- pnpm 10.x 以上
- AWS CLI（設定済み）
- AWS アカウント
- Amazon Bedrock へのアクセス権限
- Confluence Cloud アカウント（オプション）

## 📦 プロジェクト構成

```
bedrock-kb-chatbot/
├── web/                    # Next.js アプリケーション（Vercel AI Chatbot ベース）
│   ├── app/               # Next.js App Router
│   ├── components/        # React コンポーネント
│   ├── lib/               # ユーティリティとビジネスロジック
│   ├── public/            # 静的ファイル
│   ├── package.json       # 依存関係
│   └── README.md          # アプリの詳細
│
├── infra/                 # AWS CDK インフラストラクチャ
│   ├── lib/              # CDK スタック定義
│   │   ├── constructs/   # 再利用可能な Construct
│   │   └── stacks/       # CDK スタック
│   ├── bin/              # CDK エントリーポイント
│   ├── test/             # テストファイル
│   ├── package.json      # 依存関係
│   └── README.md         # インフラの詳細
│
├── doc/                   # ドキュメント
│   └── architecture.dio.svg  # システム構成図
│
└── README.md             # このファイル
```

## 🚀 クイックスタート

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd bedrock-kb-chatbot
```

VSCode から [bedrock-kb-chatbot.code-workspace](./bedrock-kb-chatbot.code-workspace) ファイルを開いて、マルチプロジェクト構成でワークスペースを開きます。

### 2. インフラストラクチャのセットアップ

```bash
cd infra
pnpm install
pnpm build
pnpm cdk deploy
```

詳細な手順は [infra/README.md](./infra/README.md) を参照してください。

### 3. アプリケーションの起動

```bash
cd web
pnpm install
pnpm db:migrate  # データベースのセットアップ
pnpm dev         # 開発サーバーの起動
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてアプリケーションを確認します。

詳細な手順は [web/README.md](./web/README.md) を参照してください。

## 📝 開発コマンド

### Web アプリケーション (web/)

```bash
pnpm dev        # 開発サーバーの起動（Turbopack）
pnpm build      # プロダクションビルド
pnpm start      # プロダクションサーバーの起動
pnpm lint       # Biome によるコード検査
pnpm format     # Biome によるコードフォーマット
pnpm db:migrate # データベースマイグレーション
pnpm db:studio  # Drizzle Studio（データベース GUI）
```

### インフラストラクチャ (infra/)

```bash
pnpm build      # TypeScript のビルド
pnpm watch      # ファイル変更の監視とビルド
pnpm test       # Jest によるテスト実行
pnpm cdk synth  # CloudFormation テンプレートの生成
pnpm cdk deploy # AWS へのデプロイ
pnpm cdk diff   # 変更内容の確認
pnpm lint       # Biome によるコード検査
pnpm format     # Biome によるコードフォーマット
```

c