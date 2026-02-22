import { BedrockAgentClient, StartIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";

const client = new BedrockAgentClient({});

export const handler = async (event: any) => {
  console.log("S3 Event received:", JSON.stringify(event, null, 2));

  try {
    const command = new StartIngestionJobCommand({
      knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
      dataSourceId: process.env.DATA_SOURCE_ID,
    });

    const response = await client.send(command);
    console.log("Bedrock KB Sync started:", response.ingestionJob?.ingestionJobId);
    
    return { statusCode: 200, body: "Sync initiated" };
  } catch (error) {
    console.error("Error starting Bedrock KB sync:", error);
    throw error;
  }
};