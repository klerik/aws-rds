#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsRdsStack } from '../lib/aws-rds-stack';

const app = new cdk.App();
new AwsRdsStack(app, 'AwsRdsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});
