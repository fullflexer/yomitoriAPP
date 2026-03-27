declare module "canvas" {
  export function createCanvas(
    width: number,
    height: number,
  ): {
    getContext: (
      contextId: "2d",
    ) => {
      fillStyle: string;
      strokeStyle: string;
      lineWidth: number;
      font: string;
      textBaseline: "alphabetic" | "top" | "middle" | "bottom";
      fillRect: (x: number, y: number, width: number, height: number) => void;
      strokeRect: (x: number, y: number, width: number, height: number) => void;
      beginPath: () => void;
      moveTo: (x: number, y: number) => void;
      lineTo: (x: number, y: number) => void;
      stroke: () => void;
      fillText: (text: string, x: number, y: number) => void;
    };
    toBuffer: (mimeType?: string) => Buffer;
  };
}
