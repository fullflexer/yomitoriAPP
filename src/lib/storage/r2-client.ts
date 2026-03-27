import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type PresignedUrlParams = {
  key: string;
  expiresIn?: number;
  contentType?: string;
};

const DEFAULT_EXPIRY_SECONDS = 60 * 10;

const globalForS3 = globalThis as typeof globalThis & {
  s3Client?: S3Client;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isMinioLikeEndpoint(endpoint: string) {
  return /localhost|127\.0\.0\.1|minio/i.test(endpoint);
}

function createS3Config(): S3ClientConfig {
  const endpoint = getRequiredEnv("S3_ENDPOINT");
  const forcePathStyle = isMinioLikeEndpoint(endpoint);

  return {
    endpoint,
    forcePathStyle,
    region: forcePathStyle ? "us-east-1" : "auto",
    credentials: {
      accessKeyId: getRequiredEnv("S3_ACCESS_KEY"),
      secretAccessKey: getRequiredEnv("S3_SECRET_KEY"),
    },
  };
}

export function getS3Client() {
  if (!globalForS3.s3Client) {
    globalForS3.s3Client = new S3Client(createS3Config());
  }

  return globalForS3.s3Client;
}

export function getUploadsBucket() {
  return getRequiredEnv("S3_BUCKET");
}

export async function createPresignedUploadUrl({
  key,
  expiresIn = DEFAULT_EXPIRY_SECONDS,
  contentType,
}: PresignedUrlParams) {
  return getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: getUploadsBucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

export async function createPresignedDownloadUrl({
  key,
  expiresIn = DEFAULT_EXPIRY_SECONDS,
}: PresignedUrlParams) {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getUploadsBucket(),
      Key: key,
    }),
    { expiresIn },
  );
}

export async function uploadUploadObject({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}) {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getUploadsBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return {
    key,
    bucket: getUploadsBucket(),
  };
}

export async function downloadUploadObject(key: string) {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getUploadsBucket(),
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`S3 object body was empty for key: ${key}`);
  }

  return readBodyAsBuffer(response.Body);
}

export async function deleteUploadObject(key: string) {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getUploadsBucket(),
      Key: key,
    }),
  );
}

async function readBodyAsBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (hasTransformToByteArray(body)) {
    return Buffer.from(await body.transformToByteArray());
  }

  if (hasArrayBuffer(body)) {
    return Buffer.from(await body.arrayBuffer());
  }

  if (isAsyncIterable(body)) {
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported S3 body type");
}

function hasTransformToByteArray(
  body: unknown,
): body is { transformToByteArray(): Promise<Uint8Array> } {
  return Boolean(
    body &&
      typeof body === "object" &&
      "transformToByteArray" in body &&
      typeof body.transformToByteArray === "function",
  );
}

function hasArrayBuffer(body: unknown): body is { arrayBuffer(): Promise<ArrayBuffer> } {
  return Boolean(
    body &&
      typeof body === "object" &&
      "arrayBuffer" in body &&
      typeof body.arrayBuffer === "function",
  );
}

function isAsyncIterable(
  body: unknown,
): body is AsyncIterable<Uint8Array | Buffer | string> {
  return Boolean(
    body &&
      typeof body === "object" &&
      Symbol.asyncIterator in body &&
      typeof body[Symbol.asyncIterator] === "function",
  );
}
