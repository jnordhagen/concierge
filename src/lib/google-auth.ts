import type { Env } from "../types.js";
import {
	getConnectedAccount,
	putConnectedAccount,
} from "./storage.js";

export const GOOGLE_PROVIDER = "google";

export const GOOGLE_SCOPES = [
	"https://www.googleapis.com/auth/calendar.freebusy",
	"https://www.googleapis.com/auth/calendar.events",
	"https://www.googleapis.com/auth/calendar.calendarlist.readonly",
	"https://www.googleapis.com/auth/calendar.settings.readonly",
	"https://www.googleapis.com/auth/tasks",
] as const;

export interface GoogleTokenSet {
	access_token: string;
	refresh_token?: string;
	expires_at: number;
	scope?: string;
	token_type?: string;
}

interface GoogleTokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
	token_type?: string;
	error?: string;
	error_description?: string;
}

export function buildGoogleAuthorizationUrl(options: {
	clientId: string;
	redirectUri: string;
	state: string;
	scopes?: readonly string[];
}): string {
	const params = new URLSearchParams({
		client_id: options.clientId,
		redirect_uri: options.redirectUri,
		response_type: "code",
		access_type: "offline",
		prompt: "consent",
		include_granted_scopes: "true",
		state: options.state,
		scope: (options.scopes ?? GOOGLE_SCOPES).join(" "),
	});

	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(options: {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	code: string;
	fetcher?: typeof fetch;
}): Promise<GoogleTokenSet> {
	const fetcher = options.fetcher ?? fetch;
	const response = await fetcher("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: options.clientId,
			client_secret: options.clientSecret,
			redirect_uri: options.redirectUri,
			code: options.code,
			grant_type: "authorization_code",
		}),
	});
	const data = (await response.json()) as GoogleTokenResponse;

	if (!response.ok || data.error || !data.access_token) {
		throw new Error(data.error_description || data.error || "Google token exchange failed");
	}

	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token,
		expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
		scope: data.scope,
		token_type: data.token_type,
	};
}

export async function refreshGoogleAccessToken(options: {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	fetcher?: typeof fetch;
}): Promise<GoogleTokenSet> {
	const fetcher = options.fetcher ?? fetch;
	const response = await fetcher("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: options.clientId,
			client_secret: options.clientSecret,
			refresh_token: options.refreshToken,
			grant_type: "refresh_token",
		}),
	});
	const data = (await response.json()) as GoogleTokenResponse;

	if (!response.ok || data.error || !data.access_token) {
		throw new Error(data.error_description || data.error || "Google token refresh failed");
	}

	return {
		access_token: data.access_token,
		refresh_token: options.refreshToken,
		expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
		scope: data.scope,
		token_type: data.token_type,
	};
}

export async function storeGoogleTokens(
	env: Env,
	userId: string,
	tokens: GoogleTokenSet,
): Promise<void> {
	await putConnectedAccount(
		env.CONCIERGE_KV,
		env.COOKIE_ENCRYPTION_KEY,
		userId,
		GOOGLE_PROVIDER,
		tokens,
	);
}

export async function getGoogleTokens(
	env: Env,
	userId: string,
): Promise<GoogleTokenSet | null> {
	const tokens = await getConnectedAccount<GoogleTokenSet>(
		env.CONCIERGE_KV,
		env.COOKIE_ENCRYPTION_KEY,
		userId,
		GOOGLE_PROVIDER,
	);

	if (!tokens) {
		return null;
	}

	const refreshWindowMs = 60 * 1000;
	if (tokens.expires_at > Date.now() + refreshWindowMs) {
		return tokens;
	}

	if (!tokens.refresh_token) {
		return null;
	}

	const refreshed = await refreshGoogleAccessToken({
		clientId: env.GOOGLE_CLIENT_ID,
		clientSecret: env.GOOGLE_CLIENT_SECRET,
		refreshToken: tokens.refresh_token,
	});
	await storeGoogleTokens(env, userId, refreshed);
	return refreshed;
}

export function hasScope(tokens: GoogleTokenSet | null, scope: string): boolean {
	if (!tokens?.scope) {
		return false;
	}
	return tokens.scope.split(/\s+/).includes(scope);
}
