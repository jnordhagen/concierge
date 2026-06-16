import { Hono } from "hono";
import type { AppBindings, Env } from "../types.js";
import { bearerAuth } from "../middleware/auth.js";

type McpHandler = {
	fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
};

export function createMcpRoutes(mcpHandlers: {
	streamableHTTP: McpHandler;
	sse: McpHandler;
}) {
	const routes = new Hono<AppBindings>();

	routes.all("/mcp", bearerAuth, async (c) => {
		const ctx = c.executionCtx as ExecutionContext & { props?: unknown };
		ctx.props = c.get("props");
		return mcpHandlers.streamableHTTP.fetch(c.req.raw, c.env, ctx);
	});

	routes.all("/mcp/*", bearerAuth, async (c) => {
		const ctx = c.executionCtx as ExecutionContext & { props?: unknown };
		ctx.props = c.get("props");
		return mcpHandlers.streamableHTTP.fetch(c.req.raw, c.env, ctx);
	});

	routes.all("/sse", bearerAuth, async (c) => {
		const ctx = c.executionCtx as ExecutionContext & { props?: unknown };
		ctx.props = c.get("props");
		return mcpHandlers.sse.fetch(c.req.raw, c.env, ctx);
	});

	routes.all("/sse/*", bearerAuth, async (c) => {
		const ctx = c.executionCtx as ExecutionContext & { props?: unknown };
		ctx.props = c.get("props");
		return mcpHandlers.sse.fetch(c.req.raw, c.env, ctx);
	});

	return routes;
}
