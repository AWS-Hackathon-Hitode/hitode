# Bedrock KB ChatBot - Web Application

Amazon Bedrock Knowledge Base を活用した AI チャットボットの Web アプリケーション

このプロジェクトは、Vercel の [AI Chatbot テンプレート](https://vercel.com/templates/next.js/nextjs-ai-chatbot) をベースに、Amazon Bedrock Knowledge Base と統合したチャットボットアプリケーションです。

## 🎯 概要

Next.js 16 と Vercel AI SDK を使用した、モダンな AI チャットボットアプリケーションです。Amazon Bedrock Knowledge Base との統合により、Confluence などのドキュメントソースを活用した高度な質問応答機能を提供します。

## 🚀 主な機能

- **AI チャット**: Vercel AI Gateway 経由での LLM 統合
- **Knowledge Base 統合**: Amazon Bedrock Knowledge Base によるドキュメント検索
- **チャット履歴**: PostgreSQL によるセッション管理
- **認証**: Auth.js による安全な認証
- **ファイルアップロード**: Vercel Blob ストレージ
- **レスポンシブデザイン**: Tailwind CSS によるモダンな UI
- **リアルタイムストリーミング**: AI SDK によるストリーミングレスポンス

## 🛠 技術スタック

- **Next.js 16** - React フレームワーク（App Router）
- **React 19** - UI ライブラリ
- **AI SDK** - LLM 統合
- **Vercel AI Gateway** - AI モデルへの統合インターフェース
- **Amazon Bedrock** - Knowledge Base & LLM
- **Tailwind CSS 4** - ユーティリティファーストの CSS
- **TypeScript 5** - 型安全性
- **Drizzle ORM** - データベース ORM
- **Auth.js** - 認証
- **Vercel Blob** - ファイルストレージ
- **Redis** - セッションキャッシュ
- **Biome** - Linter & Formatter

## 📋 前提条件

- Node.js 20.x 以上
- pnpm 10.x 以上
- Vercel アカウント（デプロイする場合）
- AWS アカウント（Bedrock Knowledge Base が必要）

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env` ファイルを作成して環境変数を設定します：

```bash
cp .env.example .env
```

`.env` ファイルを編集：

```bash
# 認証シークレット（ランダムな32文字の文字列）
# https://generate-secret.vercel.app/32 または openssl rand -base64 32
AUTH_SECRET=your-secret-key

# AI Gateway API キー（非 Vercel デプロイの場合のみ必要）
# Vercel デプロイでは OIDC トークンが自動使用されます
# https://vercel.com/ai-gateway
AI_GATEWAY_API_KEY=your-ai-gateway-key

# Vercel Blob ストレージ
# https://vercel.com/docs/storage/vercel-blob
BLOB_READ_WRITE_TOKEN=your-blob-token

# PostgreSQL データベース
# https://vercel.com/docs/storage/vercel-postgres
POSTGRES_URL=your-postgres-url

# Redis（キャッシュ）
# https://vercel.com/docs/storage/vercel-kv
REDIS_URL=your-redis-url

# AWS 認証情報
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Amazon Bedrock Knowledge Base ID
# インフラのデプロイ後に取得
KNOWLEDGE_BASE_ID=your-knowledge-base-id
```

### 3. データベースのセットアップ

```bash
pnpm db:migrate
```

### 4. 開発サーバーの起動

```bash
pnpm dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## 📝 開発コマンド

```bash
pnpm dev        # 開発サーバーの起動（Turbopack）
pnpm build      # プロダクションビルド
pnpm start      # プロダクションサーバーの起動
pnpm lint       # Biome によるコード検査
pnpm format     # Biome によるコードフォーマット
pnpm test       # Playwright テストの実行
```

### データベースコマンド

```bash
pnpm db:generate # Drizzle スキーマの生成
pnpm db:migrate  # マイグレーションの実行
pnpm db:studio   # Drizzle Studio（GUI）の起動
pnpm db:push     # スキーマの直接適用
pnpm db:pull     # 既存 DB からスキーマ取得
```

## 🗂 プロジェクト構成

```
web/
├── app/                      # Next.js App Router
│   ├── (auth)/              # 認証ページ
│   ├── (chat)/              # チャットページ
│   └── api/                 # API ルート
├── components/              # React コンポーネント
│   ├── ui/                  # UI コンポーネント（shadcn/ui）
│   └── custom/              # カスタムコンポーネント
├── lib/                     # ユーティリティとビジネスロジック
│   ├── ai/                  # AI 統合ロジック
│   ├── db/                  # データベース設定
│   └── utils/               # ヘルパー関数
├── public/                  # 静的ファイル
├── drizzle/                 # データベーススキーマとマイグレーション
└── package.json
```

## 🔑 AI Gateway の設定

このアプリケーションは [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) を使用して複数の AI モデルプロバイダーにアクセスします。

### Vercel デプロイの場合
認証は OIDC トークンで自動的に処理されます。

### 非 Vercel デプロイの場合
`.env` ファイルに `AI_GATEWAY_API_KEY` を設定する必要があります。

### モデルプロバイダーの変更

デフォルトでは Amazon Bedrock を使用していますが、[AI SDK](https://ai-sdk.dev/docs/introduction) でサポートされている他のプロバイダーに簡単に切り替えられます：

- OpenAI
- Anthropic
- Cohere
- その他多数

詳細は [AI SDK プロバイダードキュメント](https://ai-sdk.dev/providers/ai-sdk-providers) を参照してください。

## 📦 Vercel へのデプロイ

### ワンクリックデプロイ

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo/bedrock-kb-chatbot)

### 手動デプロイ

```bash
# Vercel CLI のインストール
npm i -g vercel

# ローカルインスタンスと Vercel アカウントのリンク
vercel link

# 環境変数のダウンロード
vercel env pull

# デプロイ
vercel deploy --prod
```

## 🎨 UI カスタマイズ

このプロジェクトは [shadcn/ui](https://ui.shadcn.com) を使用しています。

コンポーネントの追加：

```bash
pnpx shadcn@latest add [component-name]
```

## 🔐 認証

Auth.js を使用した認証システムが組み込まれています。

認証プロバイダーの設定は [lib/auth/config.ts](lib/auth/config.ts) で行います。

## 🧪 テスト

Playwright を使用した E2E テストが含まれています：

```bash
pnpm test
```

## 🐛 トラブルシューティング

### データベース接続エラー

```bash
# データベース接続を確認
pnpm db:studio
```

### ビルドエラー

```bash
# キャッシュをクリア
rm -rf .next
pnpm build
```

### 環境変数の確認

```bash
# 環境変数が正しく設定されているか確認
vercel env pull
```

## 📚 参考資料

- [Next.js Documentation](https://nextjs.org/docs)
- [AI SDK Documentation](https://ai-sdk.dev/docs)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [shadcn/ui](https://ui.shadcn.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [Auth.js](https://authjs.dev)

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトは Vercel AI Chatbot テンプレートをベースにしています。

## 🙏 謝辞

- [Vercel AI Chatbot Template](https://github.com/vercel/ai-chatbot)
- [Vercel AI SDK](https://sdk.vercel.ai)
- [shadcn/ui](https://ui.shadcn.com)
