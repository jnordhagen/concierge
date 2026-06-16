export interface Env extends Cloudflare.Env {}

export interface Props extends Record<string, unknown> {
	userId: string;
	name: string;
	baseUrl?: string;
}

export interface AppVariables {
	props?: Props;
	session?: Props;
}

export type AppBindings = {
	Bindings: Env;
	Variables: AppVariables;
};

export type SourceName =
	| "google_calendar"
	| "google_tasks"
	| "hevy"
	| "concierge";

export type TimelineItemType =
	| "calendar_event"
	| "task"
	| "workout"
	| "summary"
	| "plan";

export interface TimelineItem {
	id: string;
	source: SourceName;
	type: TimelineItemType;
	title: string;
	startTime?: string;
	endTime?: string;
	dueTime?: string;
	status?: string;
	url?: string;
	metadata?: Record<string, unknown>;
}

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

export interface PlanRecord {
	id: string;
	userId: string;
	kind: "day" | "training_week";
	createdAt: string;
	expiresAt: string;
	proposals: Proposal[];
	committedProposalIds: string[];
}

export interface WeeklySummary {
	id: string;
	userId: string;
	weekStart: string;
	createdAt: string;
	markdown: string;
	stats: Record<string, number>;
}
