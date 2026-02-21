import { S3Client, CopyObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export const handler = async (event: any) => {
  const record = event.Records[0];
  const sourceBucket = record.s3.bucket.name;
  const key = record.s3.object.key;

  await s3.send(
    new CopyObjectCommand({
      Bucket: process.env.TARGET_BUCKET!,
      CopySource: `${sourceBucket}/${key}`,
      Key: key,
    })
  );

  console.log("Copied:", key);
};