import type { Proposal, TimeBlock, TimeWindow } from "../types.js";

export interface WindowConstraints {
	workingHours?: {
		startHour: number;
		endHour: number;
	};
	minGapMinutes?: number;
	maxResults?: number;
}

export interface FindWindowOptions {
	startTime: string;
	endTime: string;
	durationMinutes: number;
	busy: TimeBlock[];
	constraints?: WindowConstraints;
}

interface Interval {
	start: number;
	end: number;
}

function parseTime(value: string): number {
	const time = new Date(value).getTime();
	if (Number.isNaN(time)) {
		throw new Error(`Invalid ISO date-time: ${value}`);
	}
	return time;
}

function iso(time: number): string {
	return new Date(time).toISOString();
}

function getOffsetMinutes(value: string): number {
	const match = value.match(/([+-])(\d{2}):(\d{2})$/);
	if (!match) {
		return 0;
	}
	const sign = match[1] === "-" ? -1 : 1;
	return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function localDateKey(time: number, offsetMinutes: number): string {
	const shifted = new Date(time + offsetMinutes * 60_000);
	return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function workingHourIntervals(
	start: number,
	end: number,
	startTime: string,
	constraints?: WindowConstraints,
): Interval[] {
	if (!constraints?.workingHours) {
		return [{ start, end }];
	}

	const offsetMinutes = getOffsetMinutes(startTime);
	const intervals: Interval[] = [];
	let cursor = start;
	const seen = new Set<string>();

	while (cursor < end) {
		const key = localDateKey(cursor, offsetMinutes);
		if (!seen.has(key)) {
			seen.add(key);
			const [year, month, day] = key.split("-").map(Number);
			const localStart = Date.UTC(
				year,
				month - 1,
				day,
				constraints.workingHours.startHour,
				0,
				0,
				0,
			);
			const localEnd = Date.UTC(
				year,
				month - 1,
				day,
				constraints.workingHours.endHour,
				0,
				0,
				0,
			);
			const interval = {
				start: localStart - offsetMinutes * 60_000,
				end: localEnd - offsetMinutes * 60_000,
			};
			const clipped = {
				start: Math.max(start, interval.start),
				end: Math.min(end, interval.end),
			};
			if (clipped.end > clipped.start) {
				intervals.push(clipped);
			}
		}

		cursor += 24 * 60 * 60 * 1000;
	}

	return intervals;
}

export function mergeBusyBlocks(blocks: TimeBlock[], start: number, end: number): Interval[] {
	const intervals = blocks
		.map((block) => ({
			start: Math.max(start, parseTime(block.startTime)),
			end: Math.min(end, parseTime(block.endTime)),
		}))
		.filter((block) => block.end > block.start)
		.sort((left, right) => left.start - right.start);

	const merged: Interval[] = [];
	for (const interval of intervals) {
		const previous = merged[merged.length - 1];
		if (!previous || interval.start > previous.end) {
			merged.push({ ...interval });
		} else {
			previous.end = Math.max(previous.end, interval.end);
		}
	}
	return merged;
}

function subtractBusy(available: Interval, busy: Interval[], minGapMs: number): Interval[] {
	const windows: Interval[] = [];
	let cursor = available.start;

	for (const block of busy) {
		if (block.end <= available.start || block.start >= available.end) {
			continue;
		}
		if (block.start - cursor >= minGapMs) {
			windows.push({ start: cursor, end: block.start });
		}
		cursor = Math.max(cursor, block.end);
	}

	if (available.end - cursor >= minGapMs) {
		windows.push({ start: cursor, end: available.end });
	}

	return windows;
}

export function findAvailableWindows(options: FindWindowOptions): TimeWindow[] {
	const start = parseTime(options.startTime);
	const end = parseTime(options.endTime);
	if (end <= start) {
		throw new Error("endTime must be after startTime");
	}
	if (options.durationMinutes <= 0) {
		throw new Error("durationMinutes must be positive");
	}

	const durationMs = options.durationMinutes * 60_000;
	const minGapMs = (options.constraints?.minGapMinutes ?? options.durationMinutes) * 60_000;
	const maxResults = options.constraints?.maxResults ?? 8;
	const busy = mergeBusyBlocks(options.busy, start, end);
	const workingIntervals = workingHourIntervals(
		start,
		end,
		options.startTime,
		options.constraints,
	);

	const candidateGaps = workingIntervals.flatMap((interval) =>
		subtractBusy(interval, busy, minGapMs),
	);

	return candidateGaps
		.filter((gap) => gap.end - gap.start >= durationMs)
		.slice(0, maxResults)
		.map((gap, index) => ({
			startTime: iso(gap.start),
			endTime: iso(gap.start + durationMs),
			durationMinutes: options.durationMinutes,
			score: Math.max(1, 100 - index * 8),
			reason: "Open calendar window",
		}));
}

export function buildCalendarProposal(options: {
	id: string;
	title: string;
	window: TimeWindow;
	description?: string;
	metadata?: Record<string, unknown>;
}): Proposal {
	return {
		id: options.id,
		type: "calendar_event",
		title: options.title,
		startTime: options.window.startTime,
		endTime: options.window.endTime,
		description: options.description,
		source: "concierge",
		metadata: options.metadata,
	};
}
