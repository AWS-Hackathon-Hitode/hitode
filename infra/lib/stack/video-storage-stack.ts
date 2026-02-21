import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

interface VideoStorageStackProps extends cdk.StackProps {
  stage: string;
}

export class VideoStorageStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: VideoStorageStackProps) {
    super(scope, id, props);

    const tag = `video-search-${props.stage}`;

    this.bucket = new s3.Bucket(this, "VideoSearchBucket", {
      bucketName: `${tag}-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          prefix: "processed/",
          expiration: cdk.Duration.days(7),
        },
        {
          prefix: "chunked/",
          expiration: cdk.Duration.days(7),
        },
      ],
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
      description: "Video Search S3 bucket name",
    });

    new cdk.CfnOutput(this, "UploadCommand", {
      value: `aws s3 cp <video-file> s3://${this.bucket.bucketName}/raw-videos/<videoId>/video.mp4`,
      description: "Command to upload a video",
    });
  }
}
