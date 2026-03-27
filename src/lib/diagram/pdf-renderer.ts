import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import puppeteer from "puppeteer-core";

const CHROME_PATH_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
];

const CHROME_BINARIES = [
  "google-chrome-stable",
  "google-chrome",
  "chromium",
  "chromium-browser"
];

function resolveExecutableFromPath(): string | undefined {
  for (const binary of CHROME_BINARIES) {
    try {
      const candidate = execFileSync("which", [binary], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();

      if (candidate && existsSync(candidate)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function resolveExecutablePath(): string {
  const envExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envExecutablePath && existsSync(envExecutablePath)) {
    return envExecutablePath;
  }

  const executablePath =
    CHROME_PATH_CANDIDATES.find((candidate) => existsSync(candidate)) ??
    resolveExecutableFromPath();

  if (!executablePath) {
    throw new Error(
      "Chrome executable was not found. Set PUPPETEER_EXECUTABLE_PATH explicitly."
    );
  }

  return executablePath;
}

export async function renderToPdf(svgString: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: resolveExecutablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html>
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: white;
            }
            body {
              width: 210mm;
              height: 297mm;
            }
            svg {
              display: block;
            }
          </style>
        </head>
        <body>${svgString}</body>
      </html>`,
      { waitUntil: "networkidle0" }
    );

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0"
      }
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
