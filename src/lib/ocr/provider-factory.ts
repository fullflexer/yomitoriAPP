import { ClaudeVisionProvider } from "@/lib/ocr/providers/claude-vision";
import { GlmOcrProvider } from "@/lib/ocr/providers/glm-ocr";
import { MockOcrProvider } from "@/lib/ocr/providers/mock";
import type { OcrProvider } from "@/lib/ocr/types";

export function createOcrProvider(): OcrProvider {
  const providerName = (process.env.OCR_PROVIDER ?? "glm-ocr").trim().toLowerCase();

  switch (providerName) {
    case "claude":
      return new ClaudeVisionProvider();
    case "glm-ocr":
    case "ollama":
      return new GlmOcrProvider();
    case "mock":
      return new MockOcrProvider();
    default:
      throw new Error(`Unsupported OCR provider: ${providerName}`);
  }
}
