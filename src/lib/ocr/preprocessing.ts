import sharp from "sharp";

const MAX_IMAGE_DIMENSION = 2048;
const PDF_RENDER_DENSITY = 300;

type SupportedInputFormat = "jpeg" | "png" | "tiff" | "pdf";

export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  const format = detectInputFormat(buffer);

  if (!format) {
    throw new Error("Unsupported input format. Expected JPEG, PNG, TIFF, or PDF.");
  }

  const image = createSharpInstance(buffer, format);

  return image
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .normalize()
    .jpeg({
      quality: 90,
      mozjpeg: true,
    })
    .toBuffer();
}

function createSharpInstance(buffer: Buffer, format: SupportedInputFormat) {
  if (format === "pdf") {
    return sharp(buffer, {
      density: PDF_RENDER_DENSITY,
      page: 0,
      pages: 1,
    });
  }

  if (format === "tiff") {
    return sharp(buffer, {
      page: 0,
      pages: 1,
    });
  }

  return sharp(buffer);
}

function detectInputFormat(buffer: Buffer): SupportedInputFormat | null {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0x49 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x2a &&
      buffer[3] === 0x00) ||
      (buffer[0] === 0x4d &&
        buffer[1] === 0x4d &&
        buffer[2] === 0x00 &&
        buffer[3] === 0x2a))
  ) {
    return "tiff";
  }

  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return "pdf";
  }

  return null;
}
