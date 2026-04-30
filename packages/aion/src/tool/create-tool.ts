import type { z } from "zod";
import { toProviderJsonSchema, type ZodSchema } from "../schema/zod-schema";
import type { Tool } from "./tool";

export type CreateToolOptions<
  InputSchema extends ZodSchema,
  OutputSchema extends ZodSchema | undefined = undefined,
> = {
  name: string;
  description: string;
  input: InputSchema;
  output?: OutputSchema;
  execute(
    args: z.output<InputSchema>,
  ): OutputSchema extends ZodSchema
    ? z.input<OutputSchema> | Promise<z.input<OutputSchema>>
    : unknown | Promise<unknown>;
};

type ToolOutput<OutputSchema extends ZodSchema | undefined> = OutputSchema extends ZodSchema
  ? z.output<OutputSchema>
  : unknown;

export function createTool<
  InputSchema extends ZodSchema,
  OutputSchema extends ZodSchema | undefined = undefined,
>(
  options: CreateToolOptions<InputSchema, OutputSchema>,
): Tool<z.input<InputSchema>, ToolOutput<OutputSchema>> {
  const parameters = toProviderJsonSchema(options.input);

  return {
    name: options.name,
    definition() {
      return {
        name: options.name,
        description: options.description,
        parameters,
      };
    },
    async call(args): Promise<ToolOutput<OutputSchema>> {
      const parsedArgs = options.input.parse(args);
      const result = await options.execute(parsedArgs);
      return (
        options.output === undefined ? result : options.output.parse(result)
      ) as ToolOutput<OutputSchema>;
    },
  };
}
