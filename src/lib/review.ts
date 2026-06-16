import type { TimelineItem, WeeklySummary } from "../types.js";

function hoursBetween(startTime?: string, endTime?: string): number {
	if (!startTime || !endTime) {
		return 0;
	}
	const start = new Date(startTime).getTime();
	const end = new Date(endTime).getTime();
	if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
		return 0;
	}
	return (end - start) / 3_600_000;
}

export function buildWeeklySummary(options: {
	userId: string;
	weekStart: string;
	items: TimelineItem[];
	now: string;
}): WeeklySummary {
	const calendarEvents = options.items.filter((item) => item.type === "calendar_event");
	const tasks = options.items.filter((item) => item.type === "task");
	const completedTasks = tasks.filter((item) => item.status === "completed");
	const workouts = options.items.filter((item) => item.type === "workout");
	const busyHours = calendarEvents.reduce(
		(total, item) => total + hoursBetween(item.startTime, item.endTime),
		0,
	);

	const stats = {
		calendar_events: calendarEvents.length,
		busy_hours: Math.round(busyHours * 10) / 10,
		tasks: tasks.length,
		completed_tasks: completedTasks.length,
		workouts: workouts.length,
	};

	const markdown = [
		`# Weekly Review: ${options.weekStart}`,
		"",
		`- Calendar: ${stats.calendar_events} events, about ${stats.busy_hours} busy hours.`,
		`- Tasks: ${stats.completed_tasks}/${stats.tasks} completed in the visible task set.`,
		`- Workouts: ${stats.workouts} workouts observed.`,
		"",
		"Concierge has saved this as a compact summary, not raw source data.",
	].join("\n");

	return {
		id: `summary_${crypto.randomUUID()}`,
		userId: options.userId,
		weekStart: options.weekStart,
		createdAt: options.now,
		markdown,
		stats,
	};
}
