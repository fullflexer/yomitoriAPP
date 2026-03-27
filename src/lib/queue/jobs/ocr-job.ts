import type { Job, Queue } from "bullmq";

import { runOcrPipeline } from "@/lib/ocr/pipeline";
import { createQueue } from "@/lib/queue/client";

export const OCR_QUEUE_NAME = "ocr";

export type OcrJobData = {
  documentId: string;
  caseId: string;
};

const globalForOcrQueue = globalThis as typeof globalThis & {
  ocrQueue?: Queue<OcrJobData>;
};

function getOcrQueue() {
  if (!globalForOcrQueue.ocrQueue) {
    globalForOcrQueue.ocrQueue = createQueue<OcrJobData>(OCR_QUEUE_NAME);
  }

  return globalForOcrQueue.ocrQueue;
}

export async function enqueueOcrJob(data: OcrJobData): Promise<void> {
  await getOcrQueue().add("process-document-ocr", data, {
    jobId: data.documentId,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000,
    },
    removeOnComplete: 100,
  });
}

export async function processOcrJob(job: Job<OcrJobData>): Promise<void> {
  await runOcrPipeline(job.data.documentId);
}
