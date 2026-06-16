import { describe, expect, it } from "vitest";
import { findAvailableWindows, mergeBusyBlocks } from "../src/lib/planner.js";

describe("planner", () => {
	it("merges overlapping busy blocks", () => {
		const merged = mergeBusyBlocks(
			[
				{
					startTime: "2026-06-16T09:00:00.000Z",
					endTime: "2026-06-16T10:00:00.000Z",
				},
				{
					startTime: "2026-06-16T09:30:00.000Z",
					endTime: "2026-06-16T11:00:00.000Z",
				},
			],
			new Date("2026-06-16T00:00:00.000Z").getTime(),
			new Date("2026-06-17T00:00:00.000Z").getTime(),
		);

		expect(merged).toEqual([
			{
				start: new Date("2026-06-16T09:00:00.000Z").getTime(),
				end: new Date("2026-06-16T11:00:00.000Z").getTime(),
			},
		]);
	});

	it("finds windows that avoid busy blocks and respect working hours", () => {
		const windows = findAvailableWindows({
			startTime: "2026-06-16T00:00:00-07:00",
			endTime: "2026-06-16T23:59:59-07:00",
			durationMinutes: 60,
			busy: [
				{
					startTime: "2026-06-16T10:00:00-07:00",
					endTime: "2026-06-16T12:00:00-07:00",
				},
			],
			constraints: {
				workingHours: { startHour: 9, endHour: 17 },
				maxResults: 3,
			},
		});

		expect(windows[0]).toMatchObject({
			startTime: "2026-06-16T16:00:00.000Z",
			endTime: "2026-06-16T17:00:00.000Z",
		});
		expect(windows[1]).toMatchObject({
			startTime: "2026-06-16T19:00:00.000Z",
			endTime: "2026-06-16T20:00:00.000Z",
		});
	});
});
