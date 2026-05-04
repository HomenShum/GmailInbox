#!/usr/bin/env bun
/**
 * gmail-dashboard-mcp — MCP stdio server exposing the same atomic Gmail-triage
 * tools the in-app chat agent uses. Lets external MCP clients (Claude Code,
 * Cursor, Windsurf) drive the same store.
 *
 * Pattern lifted from parity-studio mcp/src/index.ts:
 *   - McpServer + StdioServerTransport
 *   - zod schemas inline per-tool
 *   - lazy Hono dashboard auto-open on first real tool call
 *   - bounded SSE EventBus for run events
 *
 * Usage in MCP client config:
 *   "gmail-dashboard": {
 *     "command": "bun",
 *     "args": ["D:\\gmail-dashboard\\mcp-server\\src\\index.ts"]
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZodSchemas, callTool, TOOL_LIST } from "../../src/lib/tools";

const VERSION = "0.1.0";

const server = new McpServer({ name: "gmail-dashboard-mcp", version: VERSION });

// Register every tool in TOOL_LIST against the same handlers the chat agent uses.
for (const t of TOOL_LIST) {
  const zodSchema = (ZodSchemas as Record<string, any>)[t.name];
  server.tool(t.name, t.description, zodSchema.shape ?? {}, async (args: unknown) => {
    const result = await callTool(t.name, args);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      isError: !(result as any).ok,
    };
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);

// stderr only — stdout is reserved for MCP messages.
console.error(`[gmail-dashboard-mcp ${VERSION}] connected via stdio. ${TOOL_LIST.length} tools.`);
