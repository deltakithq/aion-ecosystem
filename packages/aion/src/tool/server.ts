import type { ToolDefinition } from "../completion/types";
import type { Tool } from "./tool";
import { ToolSet } from "./tool-set";

type ToolServerState = {
  staticToolNames: Set<string>;
  toolSet: ToolSet;
};

export class ToolServer {
  private staticToolNames = new Set<string>();
  private toolSet = new ToolSet();

  static empty(): ToolServer {
    return new ToolServer();
  }

  tool(tool: Tool): this {
    this.toolSet.addTool(tool);
    this.staticToolNames.add(tool.name);
    return this;
  }

  tools(tools: Tool[]): this {
    for (const tool of tools) {
      this.tool(tool);
    }
    return this;
  }

  addTools(
    toolSet: ToolSet,
    staticToolNames: string[] = toolSet.values().map((tool) => tool.name),
  ): this {
    this.toolSet.addTools(toolSet);
    for (const toolName of staticToolNames) {
      this.staticToolNames.add(toolName);
    }
    return this;
  }

  run(): ToolServerHandle {
    return new ToolServerHandle({
      staticToolNames: new Set(this.staticToolNames),
      toolSet: this.toolSet,
    });
  }
}

export class ToolServerHandle {
  constructor(private readonly state: ToolServerState) {}

  addTool(tool: Tool): void {
    this.state.toolSet.addTool(tool);
    this.state.staticToolNames.add(tool.name);
  }

  appendToolSet(toolSet: ToolSet): void {
    this.state.toolSet.addTools(toolSet);
    for (const tool of toolSet.values()) {
      this.state.staticToolNames.add(tool.name);
    }
  }

  removeTool(toolName: string): void {
    this.state.staticToolNames.delete(toolName);
    this.state.toolSet.deleteTool(toolName);
  }

  async callTool(toolName: string, args: string): Promise<string> {
    return this.state.toolSet.call(toolName, args);
  }

  async getToolDefs(prompt?: string): Promise<ToolDefinition[]> {
    const defs: ToolDefinition[] = [];
    for (const toolName of this.state.staticToolNames) {
      const tool = this.state.toolSet.get(toolName);
      if (tool !== undefined) {
        defs.push(await tool.definition(prompt ?? ""));
      }
    }
    return defs;
  }
}
