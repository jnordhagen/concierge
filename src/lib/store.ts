import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GoogleTokenSet } from "../google/auth.js";
import type { PlanRecord } from "../types.js";
import { decryptString, encryptString } from "./crypto.js";

interface StoreData {
	google?: GoogleTokenSet;
	plans: Record<string, PlanRecord>;
}

const EMPTY: StoreData = { plans: {} };

/**
 * Single-user, file-backed store at ~/.concierge/store.json, AES-GCM encrypted
 * with CONCIERGE_ENCRYPTION_KEY. Replaces the original Cloudflare-KV layer.
 * Holds the Google token set, short-lived plan proposals, and the committed-proposal
 * ids that enforce commit idempotency.
 */
export class FileStore {
	private cache: StoreData | null = null;

	constructor(
		private readonly path: string,
		private readonly encryptionKey: string,
	) {}

	private async read(): Promise<StoreData> {
		if (this.cache) {
			return this.cache;
		}
		try {
			const encrypted = await readFile(this.path, "utf8");
			const decrypted = await decryptString(encrypted.trim(), this.encryptionKey);
			const parsed = JSON.parse(decrypted) as Partial<StoreData>;
			this.cache = { ...parsed, plans: parsed.plans ?? {} };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				this.cache = structuredClone(EMPTY);
			} else {
				throw error;
			}
		}
		return this.cache;
	}

	private async write(data: StoreData): Promise<void> {
		this.cache = data;
		await mkdir(dirname(this.path), { recursive: true });
		const encrypted = await encryptString(JSON.stringify(data), this.encryptionKey);
		await writeFile(this.path, encrypted, { mode: 0o600 });
	}

	async getGoogleTokens(): Promise<GoogleTokenSet | null> {
		const data = await this.read();
		return data.google ?? null;
	}

	async setGoogleTokens(tokens: GoogleTokenSet): Promise<void> {
		const data = await this.read();
		await this.write({ ...data, google: tokens });
	}

	async getPlan(planId: string): Promise<PlanRecord | null> {
		const data = await this.read();
		const plan = data.plans[planId];
		if (!plan) {
			return null;
		}
		if (new Date(plan.expiresAt).getTime() < Date.now()) {
			return null;
		}
		return plan;
	}

	async putPlan(plan: PlanRecord): Promise<void> {
		const data = await this.read();
		// Drop expired plans opportunistically to keep the file small.
		const now = Date.now();
		const plans: Record<string, PlanRecord> = { [plan.id]: plan };
		for (const [id, existing] of Object.entries(data.plans)) {
			if (new Date(existing.expiresAt).getTime() >= now) {
				plans[id] = existing;
			}
		}
		await this.write({ ...data, plans });
	}
}
