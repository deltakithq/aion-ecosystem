import type { ToolDefinition } from "../completion/types";
import type { Tool } from "./tool";
import { ToolSet } from "./tool-set";

export class ToolRegistry {
  private exposedToolNames = new Set<string>();
  private toolSet = new ToolSet();

  static fromTools(tools: Tool[]): ToolRegistry {
    return new ToolRegistry().addTools(tools);
  }

  addTool(tool: Tool): this {
    this.toolSet.addTool(tool);
    this.exposedToolNames.add(tool.name);
    return this;
  }

  addTools(tools: Tool[]): this {
    for (const tool of tools) {
      this.addTool(tool);
    }
    return this;
  }

  addToolSet(
    toolSet: ToolSet,
    exposedToolNames: string[] = toolSet.values().map((tool) => tool.name),
  ): this {
    this.toolSet.addTools(toolSet);
    for (const toolName of exposedToolNames) {
      this.exposedToolNames.add(toolName);
    }
    return this;
  }

  removeTool(toolName: string): boolean {
    this.exposedToolNames.delete(toolName);
    return this.toolSet.deleteTool(toolName);
  }

  async callTool(toolName: string, args: string): Promise<string> {
    return this.toolSet.call(toolName, args);
  }

  async getToolDefinitions(prompt?: string): Promise<ToolDefinition[]> {
    const defs: ToolDefinition[] = [];
    for (const toolName of this.exposedToolNames) {
      const tool = this.toolSet.get(toolName);
      if (tool !== undefined) {
        defs.push(await tool.definition(prompt ?? ""));
      }
    }
    return defs;
  }
}
