import {
  BedrockAgentClient,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";

const client = new BedrockAgentClient({});

export const handler = async () => {
  await client.send(
    new StartIngestionJobCommand({
      knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID!,
      dataSourceId: process.env.DATA_SOURCE_ID!,
    })
  );

  console.log("Ingestion started");
};