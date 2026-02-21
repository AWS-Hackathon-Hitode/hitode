import {
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import type { S3Event } from "aws-lambda";

const sfn = new SFNClient();

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;

export const handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    // raw-videos/{videoId}/video.mp4 のパターンのみ処理
    const match = key.match(/^raw-videos\/([^/]+)\//);
    if (!match) {
      console.log(`Skipping non-video key: ${key}`);
      continue;
    }

    const videoId = match[1];
    console.log(`Starting pipeline for video: ${videoId}`);

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: STATE_MACHINE_ARN,
        name: `video-${videoId}-${Date.now()}`,
        input: JSON.stringify({
          videoId,
          bucket,
          key,
        }),
      }),
    );

    console.log(`Step Functions execution started for: ${videoId}`);
  }
};
