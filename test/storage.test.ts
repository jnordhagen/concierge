import { describe, expect, it } from "vitest";
import {
	getConnectedAccount,
	getPlan,
	listWeeklySummaries,
	putConnectedAccount,
	putPlan,
	putWeeklySummary,
} from "../src/lib/storage.js";
import type { PlanRecord, WeeklySummary } from "../src/types.js";
import { FakeKV } from "./fake-kv.js";

const encryptionKey =
	"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("storage", () => {
	it("round trips encrypted connected account data", async () => {
		const kv = new FakeKV().asNamespace();
		await putConnectedAccount(kv, encryptionKey, "owner", "google", {
			access_token: "secret",
		});

		const stored = await kv.get("connected:owner:google");
		expect(stored).not.toContain("secret");

		await expect(
			getConnectedAccount(kv, encryptionKey, "owner", "google"),
		).resolves.toEqual({
			access_token: "secret",
		});
	});

	it("stores plans and summaries in predictable user namespaces", async () => {
		const kv = new FakeKV().asNamespace();
		const plan: PlanRecord = {
			id: "plan_1",
			userId: "owner",
			kind: "day",
			createdAt: "2026-06-16T00:00:00.000Z",
			expiresAt: "2099-06-16T00:00:00.000Z",
			proposals: [],
			committedProposalIds: [],
		};
		const summary: WeeklySummary = {
			id: "summary_1",
			userId: "owner",
			weekStart: "2026-06-15T00:00:00.000Z",
			createdAt: "2026-06-16T00:00:00.000Z",
			markdown: "review",
			stats: { tasks: 1 },
		};

		await putPlan(kv, plan);
		await putWeeklySummary(kv, summary);

		await expect(getPlan(kv, "owner", "plan_1")).resolves.toEqual(plan);
		await expect(
			listWeeklySummaries(
				kv,
				"owner",
				"2026-06-01T00:00:00.000Z",
				"2026-06-30T00:00:00.000Z",
			),
		).resolves.toEqual([summary]);
	});
});
