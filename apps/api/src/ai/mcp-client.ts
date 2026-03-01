import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AgentTool, AgentToolContext } from './tools/index.js';
import { registerTool } from './tools/index.js';

interface McpServerConfig {
  url: string;
  name: string;
  apiKey?: string;
}

/**
 * MCP Client — connects to external MCP servers and wraps their tools
 * as AgentTools that agents can invoke.
 */
export class McpClient {
  private clients = new Map<string, Client>();

  /** Connect to an external MCP server and register its tools */
  async connectServer(config: McpServerConfig): Promise<string[]> {
    const transport = new StreamableHTTPClientTransport(
      new URL(config.url),
    );

    const client = new Client({
      name: 'coopsource-agent',
      version: '1.0.0',
    });

    await client.connect(transport);
    this.clients.set(config.name, client);

    // Discover tools from the server
    const toolsResult = await client.listTools();
    const registeredNames: string[] = [];

    for (const tool of toolsResult.tools) {
      const toolName = `mcp:${config.name}:${tool.name}`;

      const agentTool: AgentTool = {
        readonly: false, // External tools are treated as potentially mutating
        definition: {
          name: toolName,
          description: `[${config.name}] ${tool.description ?? tool.name}`,
          inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
        },
        execute: async (
          input: Record<string, unknown>,
          _ctx: AgentToolContext,
        ) => {
          const result = await client.callTool({
            name: tool.name,
            arguments: input,
          });

          // Extract text content from result
          if (result.content && Array.isArray(result.content)) {
            return result.content
              .filter(
                (c): c is { type: 'text'; text: string } => c.type === 'text',
              )
              .map((c) => c.text)
              .join('\n');
          }
          return JSON.stringify(result);
        },
      };

      registerTool(agentTool);
      registeredNames.push(toolName);
    }

    return registeredNames;
  }

  /** Disconnect from an external MCP server */
  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.close();
      this.clients.delete(name);
    }
  }

  /** Disconnect all */
  async disconnectAll(): Promise<void> {
    for (const [name] of this.clients) {
      await this.disconnectServer(name);
    }
  }
}
