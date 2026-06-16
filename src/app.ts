import { Hono } from "hono";
import type { AppBindings } from "./types.js";
import authRoutes from "./routes/auth.js";
import googleRoutes from "./routes/google.js";
import setupRoutes from "./routes/setup.js";
import { createMcpRoutes } from "./routes/mcp.js";
import { mcpHandlers } from "./mcp-handlers.js";

const app = new Hono<AppBindings>();

app.use("*", async (c, next) => {
	if (c.req.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
				"Access-Control-Max-Age": "86400",
			},
		});
	}

	await next();

	c.res.headers.set("Access-Control-Allow-Origin", "*");
	c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
	c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
});

app.onError((error, c) => {
	console.error("Unhandled error:", error);
	return c.json(
		{
			error: "internal_server_error",
			message: error instanceof Error ? error.message : "Unexpected error",
		},
		500,
	);
});

app.route("/", authRoutes);
app.route("/", googleRoutes);
app.route("/", createMcpRoutes(mcpHandlers));
app.route("/", setupRoutes);

app.notFound((c) => c.text("Not found", 404));

export default app;
