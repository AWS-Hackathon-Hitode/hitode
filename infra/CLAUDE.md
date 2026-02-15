# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AWS CDK infrastructure project for deploying an Amazon Bedrock Knowledge Base with Aurora PostgreSQL (pgvector) as the vector store. The project uses TypeScript and follows a multi-stack architecture pattern.

## Essential Commands

### Build and Development
- `pnpm run build` - Compile TypeScript to JavaScript
- `pnpm run watch` - Watch mode for continuous compilation
- `pnpm run test` - Run Jest unit tests

### Linting and Formatting
- `pnpm run lint` - Lint code with Biome
- `pnpm run format` - Format code with Biome

### CDK Operations
- `pnpm run cdk deploy <StackName> -c stage=<stage>` - Deploy stack(s)
- `pnpm run cdk diff <StackName> -c stage=<stage>` - Show stack differences
- `pnpm run cdk synth -c stage=<stage>` - Synthesize CloudFormation template
- `pnpm run cdk destroy <StackName> -c stage=<stage>` - Destroy stack(s)

### Deploying to Environments
The project uses a `stage` context parameter (defaults to "test"):
```bash
# Test environment (default)
pnpm run cdk deploy BedrockKbStackTest

# Explicit stage specification
pnpm run cdk deploy NetworkStackTest SecretsStackTest BedrockKbStackTest -c stage=test
```

## Architecture Overview

### Multi-Stack Design
The infrastructure is split into three separate CDK stacks for separation of concerns:

1. **NetworkStack** (`lib/network-stack.ts`)
   - Creates VPC with public, private, and isolated subnets
   - Configures NAT gateways and routing
   - Exports VPC for use by other stacks

2. **SecretsStack** (`lib/secrets-stack.ts`)
   - Manages AWS Secrets Manager secrets
   - Creates Aurora PostgreSQL credentials
   - Creates Confluence API credentials (optional)
   - Secrets are referenced by ARN in dependent stacks

3. **BedrockKbStack** (`lib/bedrock-kb-stack.ts`)
   - Main application stack
   - Creates Aurora PostgreSQL cluster with pgvector support
   - Creates Bedrock Knowledge Base
   - Creates S3 data source bucket
   - Optionally creates Confluence data source
   - Sets up VPC endpoints for Bedrock services
   - Depends on NetworkStack and SecretsStack

### Stack Dependencies
```
NetworkStack  ─┐
               ├─→ BedrockKbStack
SecretsStack  ─┘
```

The entry point (`bin/infra.ts`) instantiates all three stacks with proper dependency ordering.

### Configuration Management

Environment-specific configurations are centralized in `lib/config/environmental_config.ts`:
- Define the `EnvironmentConfig` interface for type safety
- Store environment-specific settings (VPC CIDR, Aurora instance types, embedding models, etc.)
- Use `getConfig(stage)` function to retrieve configuration
- Configuration is only loaded once at the entry point (`bin/infra.ts`) and passed to stacks

When adding new environments or modifying configurations, update `environmental_config.ts`.

### Naming Convention
All resources use a consistent naming pattern:
```typescript
const tag = `bedrock-kb-${stage}`;  // e.g., "bedrock-kb-test"
```
Stack names use PascalCase with stage suffix: `NetworkStackTest`, `BedrockKbStackTest`

### Important Implementation Details

1. **Aurora PostgreSQL Setup**
   - Uses Aurora PostgreSQL 16.9 with pgvector extension
   - Deployed in `PRIVATE_ISOLATED` subnets for security
   - Credentials managed via Secrets Manager (created in SecretsStack)
   - Data API enabled for Bedrock access
   - Security group restricts access to VPC CIDR only

2. **Bedrock Knowledge Base**
   - Uses RDS (Aurora) as the vector store backend
   - Table name: `bedrock_knowledge_base`
   - Field mapping: `embedding`, `text`, `metadata`, `id`
   - Requires IAM role with permissions for: embedding model, S3 bucket, Aurora secret, RDS Data API

3. **Data Sources**
   - S3 data source with inclusion prefixes: `documents/`, `knowledge/`
   - Optional Confluence data source using OAuth2 client credentials
   - Confluence configuration passed from environmental_config.ts

4. **VPC Endpoints**
   - Interface endpoints for `bedrock` and `bedrock-runtime` services
   - Deployed in `PRIVATE_WITH_EGRESS` subnets
   - Required for private access to Bedrock from within VPC

## Key Files and Patterns

### Stack Property Interfaces
Each stack defines a props interface extending `cdk.StackProps`:
```typescript
interface BedrockKbStackProps extends cdk.StackProps {
  stage: string;
  config: EnvironmentConfig["bedrockKb"];
  vpc: aws_ec2.IVpc;  // from NetworkStack
  auroraSecretArn: string;  // from SecretsStack
  confluenceSecretArn?: string;  // from SecretsStack
}
```

### Cross-Stack References
- Use public readonly properties to export resources (e.g., `vpc: aws_ec2.Vpc`)
- Pass references via constructor props rather than using CDK exports when possible
- Secret ARNs are passed as strings and referenced using `Secret.fromSecretCompleteArn()`

### CDK Outputs
All stacks include `CfnOutput` for important resource identifiers and helpful AWS CLI commands:
- Resource IDs and ARNs
- Deployment commands (e.g., S3 upload, ingestion job)
- Update commands for secrets

## Development Notes

- **Package Manager**: This project uses `pnpm` (version 10.22.0)
- **TypeScript**: Strict mode enabled, target ES2020
- **Linter/Formatter**: Biome (configured in `biome.json`)
- **Testing**: Jest with ts-jest (test directory currently empty)
- **CDK Version**: aws-cdk 2.1032.0, aws-cdk-lib 2.225.0

### Environment Variables
When deploying with Confluence data source, these environment variables must be set in `environmental_config.ts` or passed at runtime:
- `CONFLUENCE_APP_KEY`
- `CONFLUENCE_APP_SECRET`
- `CONFLUENCE_ACCESS_TOKEN`
- `CONFLUENCE_REFRESH_TOKEN`
- `CONFLUENCE_HOST_URL`
- `CONFLUENCE_SPACES` (comma-separated list)

### Resource Policies
- All resources use `RemovalPolicy.DESTROY` for easier cleanup
- Aurora has `deletionProtection: false`
- S3 bucket has `autoDeleteObjects: true`
These settings are suitable for development/test environments but should be reviewed for production.

## Common Workflows

### Adding a New Stack
1. Create stack file in `lib/` directory
2. Define stack props interface extending `cdk.StackProps`
3. Add configuration to `EnvironmentConfig` interface in `environmental_config.ts`
4. Instantiate stack in `bin/infra.ts` with proper dependencies
5. Update this documentation

### Modifying Environment Configuration
1. Update `EnvironmentConfig` interface in `lib/config/environmental_config.ts`
2. Update `environmentConfigs` object with new values
3. Update stack implementations to use new config values
4. Rebuild and redeploy affected stacks

### Post-Deployment Steps
After deploying the stacks, use the CloudFormation outputs for:
1. Uploading documents to S3 bucket
2. Starting Knowledge Base ingestion job
3. Updating Confluence credentials in Secrets Manager (if applicable)

The outputs include ready-to-use AWS CLI commands for these operations.
