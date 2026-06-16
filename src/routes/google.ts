import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { buildGoogleAuthorizationUrl, exchangeGoogleCode, storeGoogleTokens } from "../lib/google-auth.js";
import { getBaseUrl, randomToken, redirectWithReturnTo } from "../lib/http.js";
import { deleteConnectedAccount } from "../lib/storage.js";
import { getBrowserSession } from "./auth.js";

const googleRoutes = new Hono<AppBindings>();

googleRoutes.get("/connections/google/start", async (c) => {
	const session = await getBrowserSession(c);
	if (!session) {
		return c.redirect(redirectWithReturnTo("/login", "/connections/google/start"));
	}

	const state = randomToken();
	await c.env.CONCIERGE_KV.put(
		`google_state:${state}`,
		JSON.stringify({
			userId: session.props.userId,
			createdAt: new Date().toISOString(),
		}),
		{ expirationTtl: 600 },
	);

	const baseUrl = getBaseUrl(c.req.raw);
	const redirectUri = `${baseUrl}/connections/google/callback`;
	const url = buildGoogleAuthorizationUrl({
		clientId: c.env.GOOGLE_CLIENT_ID,
		redirectUri,
		state,
	});
	return c.redirect(url);
});

googleRoutes.get("/connections/google/callback", async (c) => {
	const code = c.req.query("code");
	const state = c.req.query("state");
	if (!code || !state) {
		return c.text("Missing Google OAuth code or state", 400);
	}

	const stateData = await c.env.CONCIERGE_KV.get(`google_state:${state}`, "json");
	if (!stateData || typeof stateData !== "object" || !("userId" in stateData)) {
		return c.text("Invalid or expired Google OAuth state", 400);
	}

	const baseUrl = getBaseUrl(c.req.raw);
	const redirectUri = `${baseUrl}/connections/google/callback`;
	const tokens = await exchangeGoogleCode({
		clientId: c.env.GOOGLE_CLIENT_ID,
		clientSecret: c.env.GOOGLE_CLIENT_SECRET,
		redirectUri,
		code,
	});

	await storeGoogleTokens(c.env, (stateData as { userId: string }).userId, tokens);
	await c.env.CONCIERGE_KV.delete(`google_state:${state}`);
	return c.redirect("/setup");
});

googleRoutes.post("/connections/google/disconnect", async (c) => {
	const session = await getBrowserSession(c);
	if (!session) {
		return c.redirect(redirectWithReturnTo("/login", "/setup"));
	}

	await deleteConnectedAccount(c.env.CONCIERGE_KV, session.props.userId, "google");
	return c.redirect("/setup");
});

export default googleRoutes;
