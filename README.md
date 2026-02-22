# Hitode Chatbot

Amazon Bedrock Knowledge Base を活用した AI チャットボットアプリケーション

## 🎯 概要

Hitode ChatBot は、Amazon Bedrock の Knowledge Base 機能を活用して構築された AI チャットボットです。Vercel AI Chatbot テンプレートをベースにした Next.js フロントエンドと、AWS CDK によるインフラストラクチャで、モダンでスケーラブルなアーキテクチャを実現しています。

## 🚀 主な機能

- Amazon Bedrock Knowledge Base との統合
- リアルタイムチャット機能（AI SDK）
- レスポンシブデザイン
- チャット履歴の保存（PostgreSQL）
- ファイルストレージ（S3）
- TypeScript による型安全性

## 🏗 アーキテクチャ

### 主要コンポーネント

- **Web アプリケーション**: Next.js 16 + Vercel AI SDK
- **ナレッジベース**: Amazon Bedrock Knowledge Bases
- **データベース**: Amazon Aurora PostgreSQL（チャット履歴）

## 🛠 技術スタック

### Web アプリケーション
- **Next.js 16** - React フレームワーク
- **React 19** - UI ライブラリ
- **AI SDK** - LLM 統合ライブラリ
- **Vercel AI Gateway** - AI モデルプロバイダーへの統合インターフェース
- **Tailwind CSS 4** - CSS フレームワーク
- **TypeScript 5** - 型付き JavaScript
- **Biome** - Linter & Formatter
- **Drizzle ORM** - データベース ORM
- **S3** - ファイルストレージ

### インフラストラクチャ
- **AWS CDK** - Infrastructure as Code
- **Amazon Bedrock** - AI/ML サービス
- **Amazon S3 Vector** - ベクトルストア
- **Amazon Aurora PostgreSQL** - データベース
- **AWS Lambda** - サーバーレス関数
- **TypeScript** - CDK の実装言語

## 📋 前提条件

- Node.js 20.x 以上
- pnpm 10.x 以上
- AWS CLI
- AWS アカウント
- Amazon Bedrock へのアクセス権限

## 📦 プロジェクト構成

```
hitode/
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