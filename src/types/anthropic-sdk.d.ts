declare module "@anthropic-ai/sdk" {
  export type MessageContentBlock =
    | {
        type: "text";
        text: string;
      }
    | {
        type: string;
      };

  export type MessageUsage = {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };

  export type MessageResponse = {
    content: MessageContentBlock[];
    usage?: MessageUsage;
  };

  export type MessageCreateParams = {
    model: string;
    max_tokens: number;
    temperature: number;
    messages: Array<{
      role: "user";
      content: Array<
        | {
            type: "image";
            source: {
              type: "base64";
              media_type: string;
              data: string;
            };
          }
        | {
            type: "text";
            text: string;
          }
      >;
    }>;
  };

  export default class Anthropic {
    constructor(options: { apiKey: string });

    messages: {
      create(params: MessageCreateParams): Promise<MessageResponse>;
    };
  }
}
