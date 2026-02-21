import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

interface ImageStorageStackProps extends cdk.StackProps {
  stage: string;
}

export class ImageStorageStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ImageStorageStackProps) {
    super(scope, id, props);

    const tag = `image-search-${props.stage}`;

    this.bucket = new s3.Bucket(this, "ImageSearchBucket", {
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
          // 処理済みメタデータは 30 日で削除
          prefix: "processed/",
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
      description: "Image Search S3 bucket name",
    });

    new cdk.CfnOutput(this, "UploadPrefix", {
      value: `s3://${this.bucket.bucketName}/raw-images/`,
      description: "S3 prefix for raw image uploads",
    });
  }
}
