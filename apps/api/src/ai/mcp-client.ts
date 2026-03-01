import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { Tool } from 'ai';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any, any>;
type ToolSet = Record<string, AnyTool>;

interface McpServerConfig {
  url: string;
  name: string;
  apiKey?: string;
}

/**
 * MCP Client — connects to external MCP servers via @ai-sdk/mcp.
 * Returns AI SDK ToolSet directly for use with generateText/streamText.
 */
export class McpClient {
  private clients = new Map<string, MCPClient>();

  /** Connect to an external MCP server and discover its tools */
  async connectServer(config: McpServerConfig): Promise<string[]> {
    const client = await createMCPClient({
      transport: {
        type: 'http',
        url: config.url,
        headers: config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : undefined,
      },
    });
    this.clients.set(config.name, client);

    // Get tools — returns ToolSet compatible with generateText/streamText
    const tools = await client.tools();
    return Object.keys(tools).map((name) => `mcp:${config.name}:${name}`);
  }

  /** Get merged tool set from all connected servers, prefixed with mcp:{name}: */
  async getAllTools(): Promise<ToolSet> {
    const allTools: ToolSet = {};
    for (const [name, client] of this.clients) {
      const tools = await client.tools();
      for (const [toolName, toolDef] of Object.entries(tools)) {
        allTools[`mcp:${name}:${toolName}`] = toolDef as AnyTool;
      }
    }
    return allTools;
  }

  /** Disconnect from a specific MCP server */
  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.close();
      this.clients.delete(name);
    }
  }

  /** Disconnect all connected MCP servers */
  async disconnectAll(): Promise<void> {
    for (const [name] of this.clients) {
      await this.disconnectServer(name);
    }
  }
}
