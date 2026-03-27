declare module "sharp" {
  type ResizeOptions = {
    width?: number;
    height?: number;
    fit?: "inside" | string;
    withoutEnlargement?: boolean;
  };

  type JpegOptions = {
    quality?: number;
    mozjpeg?: boolean;
  };

  type SharpOptions = {
    density?: number;
    page?: number;
    pages?: number;
  };

  interface SharpInstance {
    rotate(): SharpInstance;
    resize(options: ResizeOptions): SharpInstance;
    normalize(): SharpInstance;
    jpeg(options?: JpegOptions): SharpInstance;
    toBuffer(): Promise<Buffer>;
  }

  export default function sharp(
    input?: Buffer | Uint8Array | string,
    options?: SharpOptions,
  ): SharpInstance;
}
