export type SourceName = "google_calendar" | "google_tasks" | "concierge";

export interface TimeBlock {
	startTime: string;
	endTime: string;
	title?: string;
	source?: SourceName;
}

export interface TimeWindow {
	startTime: string;
	endTime: string;
	durationMinutes: number;
	score: number;
	reason: string;
}

export type ProposalType = "calendar_event" | "task";

export interface Proposal {
	id: string;
	type: ProposalType;
	title: string;
	startTime?: string;
	endTime?: string;
	dueTime?: string;
	description?: string;
	source: "concierge";
	metadata?: Record<string, unknown>;
}

/**
 * A short-lived, single-user plan: a set of drafted proposals that have not been
 * written upstream. `committedProposalIds` records which proposals have already
 * been turned into real calendar events, enforcing commit idempotency.
 */
export interface PlanRecord {
	id: string;
	kind: "day" | "training_week";
	createdAt: string;
	expiresAt: string;
	proposals: Proposal[];
	committedProposalIds: string[];
}
