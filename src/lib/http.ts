import type { Props } from "../types.js";

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function getBaseUrl(request: Request): string {
	const url = new URL(request.url);
	const forwardedHost = request.headers.get("X-Forwarded-Host");
	if (forwardedHost) {
		return `${url.protocol}//${forwardedHost}`;
	}

	const cfConnectingIp = request.headers.get("CF-Connecting-IP");
	const isLocalhost =
		cfConnectingIp === "::1" ||
		cfConnectingIp === "127.0.0.1" ||
		cfConnectingIp?.startsWith("127.");

	if (isLocalhost) {
		return `${url.protocol}//localhost:8788`;
	}

	return `${url.protocol}//${url.host}`;
}

export function randomToken(byteLength = 24): string {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildSessionCookie(token: string, request: Request): string {
	const url = new URL(request.url);
	const secure = url.protocol === "https:" ? " Secure;" : "";
	return `concierge_session=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(request: Request): string {
	const url = new URL(request.url);
	const secure = url.protocol === "https:" ? " Secure;" : "";
	return `concierge_session=; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=0`;
}

export function getCookie(request: Request, name: string): string | null {
	const cookie = request.headers.get("Cookie");
	if (!cookie) {
		return null;
	}

	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]+)`));
	return match ? decodeURIComponent(match[1]) : null;
}

export function ownerProps(request: Request): Props {
	return {
		userId: "owner",
		name: "Owner",
		baseUrl: getBaseUrl(request),
	};
}

export function redirectWithReturnTo(path: string, returnTo: string): string {
	const url = new URL(path, "https://concierge.local");
	url.searchParams.set("return_to", returnTo);
	return `${url.pathname}${url.search}`;
}
