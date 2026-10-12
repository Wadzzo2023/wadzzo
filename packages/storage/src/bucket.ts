import { S3Client } from "@aws-sdk/client-s3";
import { requireEnv } from "@wadzzo/errors";

/** The bucket every Wadzzo app and the task server write to. Read lazily so importing never needs env. */
interface BucketConfig {
  name: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function readBucketConfig(): BucketConfig {
  return {
    name: requireEnv("AWS_BUCKET_NAME", process.env.AWS_BUCKET_NAME),
    region: requireEnv("AWS_BUCKET_REGION", process.env.AWS_BUCKET_REGION),
    accessKeyId: requireEnv("AWS_ACCESS_KEY", process.env.AWS_ACCESS_KEY),
    secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY", process.env.AWS_SECRET_ACCESS_KEY),
  };
}

let client: S3Client | undefined;

/** The shared S3 client. */
export function getS3Client(): S3Client {
  client ??= (() => {
    const config = readBucketConfig();
    return new S3Client({
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  })();
  return client;
}

export const getBucketName = (): string =>
  requireEnv("AWS_BUCKET_NAME", process.env.AWS_BUCKET_NAME);

/** Public URL of an object in the bucket. */
export const publicS3Url = (key: string): string =>
  `https://${getBucketName()}.s3.amazonaws.com/${key}`;

/** True for a URL this bucket serves: used to reject foreign links. */
export const isOwnS3Url = (url: string): boolean => url.startsWith(publicS3Url(""));
