// lib/aws-rds-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { aws_apigateway as apigateway } from 'aws-cdk-lib';
import * as path from 'path';

export class AwsRdsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1️⃣ Create a VPC
    const vpc = new ec2.Vpc(this, 'NestVpc', {
      maxAzs: 2,
    });

    // 2️⃣ Create Security Group for RDS
    const rdsSecurityGroup = new ec2.SecurityGroup(this, 'RDSSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    // Allow incoming traffic on Postgres port from Lambda
    rdsSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(5432));

    // 3️⃣ Create a secret for DB credentials
    const dbSecret = new secretsmanager.Secret(this, 'DBCredentialsSecret', {
      secretName: 'rds-postgres-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    // 4️⃣ Define the PostgreSQL RDS instance
    const dbInstance = new rds.DatabaseInstance(this, 'PostgresDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_14,
      }),
      vpc,
      credentials: rds.Credentials.fromSecret(dbSecret),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      securityGroups: [rdsSecurityGroup],
      publiclyAccessible: false, // keep private
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Not for production!
      deletionProtection: false,
      multiAz: false,
      databaseName: 'nestdb',
    });

    // 5️⃣ Lambda for Nest.js
    const nestLambda = new lambdaNodejs.NodejsFunction(this, 'NestLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../nodejs-aws-cart-api/src/main-lambda.ts'),
      handler: 'handler',
      vpc, // Lambda inside same VPC
      memorySize: 512,
      bundling: {
        externalModules: [
          '@nestjs/websockets',
          '@nestjs/microservices',
          '@nestjs/websockets/socket-module',
          '@nestjs/microservices/microservices-module',
          'class-validator',
          'class-transformer'
        ],
        forceDockerBundling: false
      },
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_PORT: '5432',
        DB_NAME: 'nestdb',
        DB_USER: 'postgres',
        DB_PASSWORD: dbSecret.secretValueFromJson('password').unsafeUnwrap(),
      },
    });

    // Grant Lambda read access to the secret
    dbSecret.grantRead(nestLambda);

    // 6️⃣ API Gateway
    const api = new apigateway.RestApi(this, 'NestApi', {
      restApiName: 'Nest Service',
      description: 'Nest.js with RDS PostgreSQL',
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(nestLambda);
    api.root.addMethod('ANY', lambdaIntegration);
  }
}
