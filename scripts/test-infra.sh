#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

required_vars=(
  DATABASE_URL
  REDIS_URL
  S3_ENDPOINT
  S3_BUCKET
  S3_ACCESS_KEY
  S3_SECRET_KEY
)

for var_name in "${required_vars[@]}"; do
  value="${!var_name:-}"

  if [[ -z "${value}" || "${value}" == *"<"* ]]; then
    echo "Missing or placeholder environment variable: ${var_name}" >&2
    exit 1
  fi
done

echo "Checking PostgreSQL connectivity..."
printf 'SELECT 1;\n' | pnpm exec prisma db execute --stdin --url "${DATABASE_URL}" >/dev/null
echo "PostgreSQL OK"

echo "Checking Redis connectivity..."
node --input-type=module <<'EOF'
import IORedis from "ioredis";

const client = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
});

try {
  const pong = await client.ping();
  if (pong !== "PONG") {
    throw new Error(`Unexpected Redis response: ${pong}`);
  }

  console.log("Redis OK");
} finally {
  await client.quit();
}
EOF

echo "Checking S3 bucket accessibility..."
node --input-type=module <<'EOF'
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const forcePathStyle = /localhost|127\.0\.0\.1|minio/i.test(endpoint);

const client = new S3Client({
  endpoint,
  forcePathStyle,
  region: forcePathStyle ? "us-east-1" : "auto",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

await client.send(
  new HeadBucketCommand({
    Bucket: process.env.S3_BUCKET,
  }),
);

console.log("S3 bucket OK");
EOF
