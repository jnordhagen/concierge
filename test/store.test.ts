import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptString, encryptString } from "../src/lib/crypto.js";
import { FileStore } from "../src/lib/store.js";
import type { PlanRecord } from "../src/types.js";

const encryptionKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("crypto", () => {
	it("round trips an encrypted string without leaking the plaintext", async () => {
		const ciphertext = await encryptString("secret-token", encryptionKey);
		expect(ciphertext).not.toContain("secret-token");
		await expect(decryptString(ciphertext, encryptionKey)).resolves.toBe("secret-token");
	});
});

describe("FileStore", () => {
	let dir: string;
	let path: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "concierge-test-"));
		path = join(dir, "store.json");
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("persists Google tokens encrypted on disk", async () => {
		const store = new FileStore(path, encryptionKey);
		await store.setGoogleTokens({ access_token: "secret", expires_at: Date.now() + 3600_000 });

		const onDisk = await readFile(path, "utf8");
		expect(onDisk).not.toContain("secret");

		const reloaded = new FileStore(path, encryptionKey);
		await expect(reloaded.getGoogleTokens()).resolves.toMatchObject({ access_token: "secret" });
	});

	it("stores plans and hides expired ones", async () => {
		const store = new FileStore(path, encryptionKey);
		const live: PlanRecord = {
			id: "plan_live",
			kind: "day",
			createdAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 3600_000).toISOString(),
			proposals: [],
			committedProposalIds: [],
		};
		const expired: PlanRecord = {
			...live,
			id: "plan_expired",
			expiresAt: new Date(Date.now() - 1000).toISOString(),
		};

		await store.putPlan(live);
		await store.putPlan(expired);

		await expect(store.getPlan("plan_live")).resolves.toMatchObject({ id: "plan_live" });
		await expect(store.getPlan("plan_expired")).resolves.toBeNull();
	});
});
