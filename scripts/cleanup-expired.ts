import { cleanupExpiredCases, formatCleanupReport } from "../src/lib/cleanup/cleanup-expired";
import { prisma } from "../src/lib/db/client";
import { deleteUploadObject } from "../src/lib/storage/r2-client";

async function main() {
  const result = await cleanupExpiredCases({
    prisma,
    deleteObject: deleteUploadObject,
  });

  console.log(formatCleanupReport(result));

  if (result.failedObjectKeys.length > 0) {
    console.error(`failedObjectKeys=${result.failedObjectKeys.join(",")}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
