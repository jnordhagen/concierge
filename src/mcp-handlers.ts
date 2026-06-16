import { ConciergeMCP } from "./mcp-agent.js";

export const mcpHandlers = {
	streamableHTTP: ConciergeMCP.serve("/mcp", { binding: "MCP_OBJECT" }),
	sse: ConciergeMCP.serveSSE("/sse", { binding: "MCP_OBJECT" }),
};
