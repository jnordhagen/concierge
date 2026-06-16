import type { PlanRecord, Props, WeeklySummary } from "../types.js";

export const GOOGLE_ACCOUNT_KEY = "connected:google";

function hexToBytes(hex: string): Uint8Array {
	if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
		throw new Error("COOKIE_ENCRYPTION_KEY must be a 64-character hex string");
	}

	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < hex.length; index += 2) {
		bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
	}
	return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function encryptString(
	value: string,
	encryptionKeyHex: string,
): Promise<string> {
	const keyBytes = hexToBytes(encryptionKeyHex);
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"],
	);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(value);
	const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded);
	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.length);
	return bytesToBase64(combined);
}

export async function decryptString(
	value: string,
	encryptionKeyHex: string,
): Promise<string> {
	const keyBytes = hexToBytes(encryptionKeyHex);
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-GCM", length: 256 },
		false,
		["decrypt"],
	);
	const combined = base64ToBytes(value);
	const iv = combined.slice(0, 12);
	const encrypted = combined.slice(12);
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		cryptoKey,
		encrypted,
	);
	return new TextDecoder().decode(decrypted);
}

export async function putEncryptedJson<T>(
	kv: KVNamespace,
	encryptionKeyHex: string,
	key: string,
	value: T,
	options?: KVNamespacePutOptions,
): Promise<void> {
	const encrypted = await encryptString(JSON.stringify(value), encryptionKeyHex);
	await kv.put(key, encrypted, options);
}

export async function getEncryptedJson<T>(
	kv: KVNamespace,
	encryptionKeyHex: string,
	key: string,
): Promise<T | null> {
	const encrypted = await kv.get(key);
	if (!encrypted) {
		return null;
	}

	try {
		return JSON.parse(await decryptString(encrypted, encryptionKeyHex)) as T;
	} catch (error) {
		console.error(`Failed to decrypt or parse KV value for ${key}:`, error);
		return null;
	}
}

export function connectedAccountKey(userId: string, provider: string): string {
	return `connected:${userId}:${provider}`;
}

export async function putConnectedAccount<T>(
	kv: KVNamespace,
	encryptionKeyHex: string,
	userId: string,
	provider: string,
	value: T,
): Promise<void> {
	await putEncryptedJson(kv, encryptionKeyHex, connectedAccountKey(userId, provider), value);
}

export async function getConnectedAccount<T>(
	kv: KVNamespace,
	encryptionKeyHex: string,
	userId: string,
	provider: string,
): Promise<T | null> {
	return getEncryptedJson<T>(kv, encryptionKeyHex, connectedAccountKey(userId, provider));
}

export async function deleteConnectedAccount(
	kv: KVNamespace,
	userId: string,
	provider: string,
): Promise<void> {
	await kv.delete(connectedAccountKey(userId, provider));
}

export async function createSession(
	kv: KVNamespace,
	token: string,
	props: Props,
): Promise<void> {
	await kv.put(`session:${token}`, JSON.stringify(props), {
		expirationTtl: 30 * 24 * 60 * 60,
	});
}

export async function getSession(kv: KVNamespace, token: string): Promise<Props | null> {
	const session = await kv.get(`session:${token}`, "json");
	if (!session || typeof session !== "object" || !("userId" in session)) {
		return null;
	}
	return session as Props;
}

export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
	await kv.delete(`session:${token}`);
}

export async function putPlan(kv: KVNamespace, plan: PlanRecord): Promise<void> {
	const ttlSeconds = Math.max(
		60,
		Math.floor((new Date(plan.expiresAt).getTime() - Date.now()) / 1000),
	);
	await kv.put(`plan:${plan.userId}:${plan.id}`, JSON.stringify(plan), {
		expirationTtl: ttlSeconds,
	});
}

export async function getPlan(
	kv: KVNamespace,
	userId: string,
	planId: string,
): Promise<PlanRecord | null> {
	const plan = await kv.get(`plan:${userId}:${planId}`, "json");
	if (!plan || typeof plan !== "object" || !("id" in plan)) {
		return null;
	}
	return plan as PlanRecord;
}

export async function putWeeklySummary(
	kv: KVNamespace,
	summary: WeeklySummary,
): Promise<void> {
	await kv.put(
		`summary:${summary.userId}:${summary.weekStart}:${summary.id}`,
		JSON.stringify(summary),
	);
}

export async function listWeeklySummaries(
	kv: KVNamespace,
	userId: string,
	startTime: string,
	endTime: string,
): Promise<WeeklySummary[]> {
	const list = await kv.list({ prefix: `summary:${userId}:` });
	const start = new Date(startTime).getTime();
	const end = new Date(endTime).getTime();
	const summaries: WeeklySummary[] = [];

	for (const key of list.keys) {
		const summary = await kv.get(key.name, "json");
		if (!summary || typeof summary !== "object" || !("weekStart" in summary)) {
			continue;
		}

		const typed = summary as WeeklySummary;
		const weekStart = new Date(typed.weekStart).getTime();
		if (weekStart >= start && weekStart <= end) {
			summaries.push(typed);
		}
	}

	return summaries;
}
