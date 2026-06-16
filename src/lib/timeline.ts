import type {
	SourceName,
	TimeBlock,
	TimelineItem,
	WeeklySummary,
} from "../types.js";
import type { GoogleCalendarEvent } from "./google-calendar.js";
import type { GoogleTask } from "./google-tasks.js";

function eventStart(event: GoogleCalendarEvent): string | undefined {
	return event.start?.dateTime ?? event.start?.date;
}

function eventEnd(event: GoogleCalendarEvent): string | undefined {
	return event.end?.dateTime ?? event.end?.date;
}

export function normalizeCalendarEvent(event: GoogleCalendarEvent): TimelineItem {
	return {
		id: event.id,
		source: "google_calendar",
		type: "calendar_event",
		title: event.summary || "Untitled event",
		startTime: eventStart(event),
		endTime: eventEnd(event),
		status: event.status,
		url: event.htmlLink,
		metadata: {
			concierge: event.extendedProperties?.private,
		},
	};
}

export function normalizeTask(task: GoogleTask, taskListId: string): TimelineItem {
	return {
		id: task.id,
		source: "google_tasks",
		type: "task",
		title: task.title || "Untitled task",
		dueTime: task.due,
		status: task.status,
		url: task.selfLink,
		metadata: {
			taskListId,
			updated: task.updated,
		},
	};
}

export function normalizeSummary(summary: WeeklySummary): TimelineItem {
	return {
		id: summary.id,
		source: "concierge",
		type: "summary",
		title: `Weekly review for ${summary.weekStart}`,
		startTime: summary.weekStart,
		status: "saved",
		metadata: {
			stats: summary.stats,
			markdown: summary.markdown,
		},
	};
}

export function calendarEventsToBusyBlocks(
	events: GoogleCalendarEvent[],
	source: SourceName = "google_calendar",
): TimeBlock[] {
	const blocks: TimeBlock[] = [];
	for (const event of events) {
			const startTime = eventStart(event);
			const endTime = eventEnd(event);
			if (!startTime || !endTime) {
				continue;
			}
			blocks.push({
				startTime,
				endTime,
				title: event.summary,
				source,
			});
	}
	return blocks;
}

export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
	return [...items].sort((left, right) => {
		const leftTime = left.startTime ?? left.dueTime ?? "";
		const rightTime = right.startTime ?? right.dueTime ?? "";
		return leftTime.localeCompare(rightTime);
	});
}
