import { describe, expect, it } from "vitest";
import { buildWeeklySummary } from "../src/lib/review.js";

describe("review", () => {
	it("summarizes visible calendar, task, and workout items", () => {
		const summary = buildWeeklySummary({
			userId: "owner",
			weekStart: "2026-06-15T00:00:00.000Z",
			now: "2026-06-16T00:00:00.000Z",
			items: [
				{
					id: "event_1",
					source: "google_calendar",
					type: "calendar_event",
					title: "Meeting",
					startTime: "2026-06-16T09:00:00.000Z",
					endTime: "2026-06-16T10:30:00.000Z",
				},
				{
					id: "task_1",
					source: "google_tasks",
					type: "task",
					title: "Send note",
					status: "completed",
				},
				{
					id: "workout_1",
					source: "hevy",
					type: "workout",
					title: "Push",
				},
			],
		});

		expect(summary.stats).toEqual({
			calendar_events: 1,
			busy_hours: 1.5,
			tasks: 1,
			completed_tasks: 1,
			workouts: 1,
		});
		expect(summary.markdown).toContain("Weekly Review");
	});
});
