import { Worker } from "bullmq";

import { getRedisConnection } from "@/lib/queue/client";
import { OCR_QUEUE_NAME, type OcrJobData, processOcrJob } from "@/lib/queue/jobs/ocr-job";

const DEFAULT_CONCURRENCY = 1;

const concurrency = parseConcurrency(process.env.OCR_CONCURRENCY);
const connection = getRedisConnection();

const worker = new Worker<OcrJobData>(OCR_QUEUE_NAME, processOcrJob, {
  connection,
  concurrency,
});

void worker.waitUntilReady().then(() => {
  console.info(`[ocr-worker] ready queue=${OCR_QUEUE_NAME} concurrency=${concurrency}`);
}).catch((error) => {
  console.error("[ocr-worker] failed to become ready", error);
});

worker.on("completed", (job) => {
  console.info(`[ocr-worker] completed jobId=${job.id ?? "unknown"} documentId=${job.data.documentId}`);
});

worker.on("failed", (job, error) => {
  const documentId = job?.data.documentId ?? "unknown";
  console.error(`[ocr-worker] failed documentId=${documentId}`, error);
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info(`[ocr-worker] shutting down on ${signal}`);

  try {
    await worker.close();
    await connection.quit();
    process.exit(0);
  } catch (error) {
    console.error("[ocr-worker] shutdown failed", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

function parseConcurrency(value: string | undefined) {
  const parsed = Number(value ?? DEFAULT_CONCURRENCY);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_CONCURRENCY;
  }

  return parsed;
}
