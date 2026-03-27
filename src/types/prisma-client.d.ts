declare module "@prisma/client" {
  export class PrismaClient {
    [key: string]: unknown;

    document: {
      findMany(args: unknown): Promise<any[]>;
    };

    constructor(options?: {
      log?: string[];
    });
  }
}
