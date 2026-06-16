import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types.js";
import { ownerProps } from "../lib/http.js";
import { getSession } from "../lib/storage.js";

export const bearerAuth = createMiddleware<AppBindings>(async (c, next) => {
	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return c.json(
			{
				error: "unauthorized",
				message: "Authentication required. Provide a Bearer token.",
			},
			401,
			{
				"WWW-Authenticate": `Bearer realm="${c.req.url}", error="invalid_token"`,
			},
		);
	}

	const token = authHeader.substring("Bearer ".length);
	if (token === c.env.OWNER_TOKEN) {
		c.set("props", ownerProps(c.req.raw));
		await next();
		return;
	}

	const session = await getSession(c.env.CONCIERGE_KV, token);
	if (!session) {
		return c.json(
			{
				error: "unauthorized",
				message: "Invalid token.",
			},
			401,
		);
	}

	c.set("props", { ...session, baseUrl: ownerProps(c.req.raw).baseUrl });
	await next();
});
