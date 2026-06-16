import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { GOOGLE_PROVIDER } from "../lib/google-auth.js";
import { getConnectedAccount } from "../lib/storage.js";
import { getBrowserSession } from "./auth.js";

const setupRoutes = new Hono<AppBindings>();

function page(options: { connected: boolean; userId: string }): string {
	const googleStatus = options.connected ? "Connected" : "Not connected";
	const googleAction = options.connected
		? `<form method="post" action="/connections/google/disconnect"><button type="submit">Disconnect Google</button></form>`
		: `<a class="button" href="/connections/google/start">Connect Google</a>`;

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Concierge Setup</title>
	<style>
		body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100vh; background: #f6f4ef; color: #1d1d1f; }
		main { width: min(760px, calc(100vw - 32px)); margin: 56px auto; }
		header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; }
		h1 { margin: 0; font-size: 34px; }
		.panel { background: white; border: 1px solid #dedbd2; border-radius: 8px; padding: 24px; margin-bottom: 16px; }
		.row { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
		.status { font-weight: 700; }
		.status.connected { color: #146c43; }
		.status.missing { color: #9a3412; }
		a, button { font: inherit; }
		.button, button { display: inline-block; padding: 10px 14px; border: 0; border-radius: 6px; background: #1d1d1f; color: white; text-decoration: none; font-weight: 700; cursor: pointer; }
		.logout { color: #61605a; }
		code { background: #eeebe3; border-radius: 4px; padding: 2px 5px; }
	</style>
</head>
<body>
	<main>
		<header>
			<div>
				<h1>Concierge</h1>
				<p>Signed in as <code>${options.userId}</code></p>
			</div>
			<a class="logout" href="/logout">Log out</a>
		</header>
		<section class="panel">
			<div class="row">
				<div>
					<h2>Google Calendar and Tasks</h2>
					<p class="status ${options.connected ? "connected" : "missing"}">${googleStatus}</p>
				</div>
				${googleAction}
			</div>
		</section>
		<section class="panel">
			<h2>MCP</h2>
			<p>Endpoint: <code>/mcp</code></p>
			<p>Use your owner token as a Bearer token, or let an MCP client complete the OAuth flow.</p>
		</section>
	</main>
</body>
</html>`;
}

setupRoutes.get("/", (c) => {
	return c.html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Concierge</title></head>
<body>
	<h1>Concierge</h1>
	<p>A personal MCP server for calendar, tasks, plans, and summaries.</p>
	<p><a href="/setup">Open setup</a></p>
</body>
</html>`);
});

setupRoutes.get("/health", (c) => {
	return c.json({
		status: "ok",
		service: "concierge",
		timestamp: new Date().toISOString(),
	});
});

setupRoutes.get("/setup", async (c) => {
	const session = await getBrowserSession(c);
	if (!session) {
		return c.redirect("/login?return_to=/setup");
	}

	const google = await getConnectedAccount(
		c.env.CONCIERGE_KV,
		c.env.COOKIE_ENCRYPTION_KEY,
		session.props.userId,
		GOOGLE_PROVIDER,
	);
	return c.html(page({ connected: Boolean(google), userId: session.props.userId }));
});

export default setupRoutes;
