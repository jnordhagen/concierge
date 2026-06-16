import { Hono } from "hono";
import type { AppBindings, Props } from "../types.js";
import {
	buildSessionCookie,
	clearSessionCookie,
	getBaseUrl,
	getCookie,
	ownerProps,
	randomToken,
	redirectWithReturnTo,
} from "../lib/http.js";
import { createSession, deleteSession, getSession } from "../lib/storage.js";

const authRoutes = new Hono<AppBindings>();

async function getBrowserSession(c: { req: { raw: Request }; env: AppBindings["Bindings"] }) {
	const token = getCookie(c.req.raw, "concierge_session");
	if (!token) {
		return null;
	}
	const session = await getSession(c.env.CONCIERGE_KV, token);
	return session ? { token, props: session } : null;
}

function loginHtml(returnTo: string): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Concierge Login</title>
	<style>
		body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f4ef; color: #1d1d1f; }
		main { width: min(420px, calc(100vw - 32px)); background: white; border: 1px solid #dedbd2; border-radius: 8px; padding: 28px; box-shadow: 0 18px 48px rgba(20, 20, 20, 0.12); }
		h1 { margin: 0 0 8px; font-size: 28px; }
		p { margin: 0 0 24px; color: #61605a; line-height: 1.5; }
		label { display: block; margin-bottom: 8px; font-weight: 650; }
		input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #c9c5ba; border-radius: 6px; font: inherit; }
		button { margin-top: 16px; width: 100%; padding: 12px; border: 0; border-radius: 6px; background: #1d1d1f; color: white; font-weight: 700; cursor: pointer; }
	</style>
</head>
<body>
	<main>
		<h1>Concierge</h1>
		<p>Sign in with your owner token to manage connected accounts.</p>
		<form method="post" action="/login">
			<input type="hidden" name="return_to" value="${returnTo.replace(/"/g, "&quot;")}">
			<label for="owner_token">Owner token</label>
			<input id="owner_token" name="owner_token" type="password" autocomplete="current-password" autofocus>
			<button type="submit">Continue</button>
		</form>
	</main>
</body>
</html>`;
}

authRoutes.get("/login", (c) => {
	const returnTo = c.req.query("return_to") || "/setup";
	return c.html(loginHtml(returnTo));
});

authRoutes.post("/login", async (c) => {
	const form = await c.req.formData();
	const token = String(form.get("owner_token") || "");
	const returnTo = String(form.get("return_to") || "/setup");

	if (!token || token !== c.env.OWNER_TOKEN) {
		return c.html(loginHtml(returnTo), 401);
	}

	const sessionToken = randomToken();
	const props: Props = ownerProps(c.req.raw);
	await createSession(c.env.CONCIERGE_KV, sessionToken, props);

	const response = c.redirect(returnTo.startsWith("/") ? returnTo : "/setup");
	response.headers.set("Set-Cookie", buildSessionCookie(sessionToken, c.req.raw));
	return response;
});

authRoutes.get("/logout", async (c) => {
	const token = getCookie(c.req.raw, "concierge_session");
	if (token) {
		await deleteSession(c.env.CONCIERGE_KV, token);
	}
	const response = c.redirect("/");
	response.headers.set("Set-Cookie", clearSessionCookie(c.req.raw));
	return response;
});

authRoutes.get("/.well-known/oauth-protected-resource", (c) => {
	const baseUrl = getBaseUrl(c.req.raw);
	return c.json({
		resource: baseUrl,
		authorization_servers: [baseUrl],
		bearer_methods_supported: ["header"],
		resource_documentation: `${baseUrl}/`,
	});
});

authRoutes.get("/.well-known/oauth-authorization-server", (c) => {
	const baseUrl = getBaseUrl(c.req.raw);
	return c.json({
		issuer: baseUrl,
		authorization_endpoint: `${baseUrl}/authorize`,
		token_endpoint: `${baseUrl}/token`,
		registration_endpoint: `${baseUrl}/register`,
		scopes_supported: ["mcp"],
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code"],
		token_endpoint_auth_methods_supported: ["none"],
	});
});

authRoutes.post("/register", async (c) => {
	const body = (await c.req.json()) as { redirect_uris?: string[] };
	if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
		return c.json({ error: "invalid_redirect_uri" }, 400);
	}

	const clientId = randomToken(16);
	await c.env.CONCIERGE_KV.put(
		`client:${clientId}`,
		JSON.stringify({
			client_id: clientId,
			redirect_uris: body.redirect_uris,
			created_at: new Date().toISOString(),
		}),
		{ expirationTtl: 365 * 24 * 60 * 60 },
	);

	return c.json({
		client_id: clientId,
		redirect_uris: body.redirect_uris,
		grant_types: ["authorization_code"],
		token_endpoint_auth_method: "none",
	});
});

authRoutes.get("/authorize", async (c) => {
	const clientId = c.req.query("client_id");
	const redirectUri = c.req.query("redirect_uri");
	const state = c.req.query("state");

	if (!clientId || !redirectUri || !state) {
		return c.text("Missing client_id, redirect_uri, or state", 400);
	}

	const session = await getBrowserSession(c);
	if (!session) {
		const url = new URL(c.req.url);
		return c.redirect(redirectWithReturnTo("/login", `${url.pathname}${url.search}`));
	}

	const authCode = randomToken();
	await c.env.CONCIERGE_KV.put(
		`authcode:${authCode}`,
		JSON.stringify({
			clientId,
			redirectUri,
			sessionToken: session.token,
		}),
		{ expirationTtl: 600 },
	);

	const redirectUrl = new URL(redirectUri);
	redirectUrl.searchParams.set("code", authCode);
	redirectUrl.searchParams.set("state", state);
	return c.redirect(redirectUrl.toString());
});

authRoutes.post("/token", async (c) => {
	const form = await c.req.formData();
	const grantType = form.get("grant_type");
	const code = form.get("code");
	const redirectUri = form.get("redirect_uri");
	const clientId = form.get("client_id");

	if (grantType !== "authorization_code" || !code || !redirectUri || !clientId) {
		return c.json({ error: "invalid_request" }, 400);
	}

	const authData = await c.env.CONCIERGE_KV.get(`authcode:${code}`, "json");
	if (!authData || typeof authData !== "object") {
		return c.json({ error: "invalid_grant" }, 400);
	}

	const typed = authData as {
		clientId: string;
		redirectUri: string;
		sessionToken: string;
	};
	if (typed.clientId !== clientId || typed.redirectUri !== redirectUri) {
		return c.json({ error: "invalid_grant" }, 400);
	}

	await c.env.CONCIERGE_KV.delete(`authcode:${code}`);
	return c.json({
		access_token: typed.sessionToken,
		token_type: "Bearer",
		expires_in: 30 * 24 * 60 * 60,
		scope: "mcp",
	});
});

export { getBrowserSession };
export default authRoutes;
