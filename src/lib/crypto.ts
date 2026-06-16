// AES-GCM string encryption using the Web Crypto API (global in Node 18+).
// Salvaged verbatim from the original Concierge storage layer.

function hexToBytes(hex: string): Uint8Array {
	if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
		throw new Error("CONCIERGE_ENCRYPTION_KEY must be a 64-character hex string");
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

export async function encryptString(value: string, encryptionKeyHex: string): Promise<string> {
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

export async function decryptString(value: string, encryptionKeyHex: string): Promise<string> {
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
	const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encrypted);
	return new TextDecoder().decode(decrypted);
}
