import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class MakeIamRoleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    new iam.Role(this, 'MyCdkProjectStack-cdk-lambda-full-access', {
      assumedBy: new iam.AccountPrincipal(this.account),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambda_FullAccess')
      ],
      roleName: 'cdk-lambda-full-access'
    })


    // example resource
    // const queue = new sqs.Queue(this, 'MakeIamRoleQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
