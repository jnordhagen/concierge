import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env, PlanRecord, Props, TimeBlock, TimelineItem } from "../types.js";
import { GOOGLE_PROVIDER, getGoogleTokens, hasScope } from "./google-auth.js";
import { GoogleCalendarClient } from "./google-calendar.js";
import { GoogleTasksClient } from "./google-tasks.js";
import { handleToolError, jsonContent, textContent } from "./errors.js";
import { buildCalendarProposal, findAvailableWindows } from "./planner.js";
import { buildWeeklySummary } from "./review.js";
import {
	getConnectedAccount,
	getPlan,
	listWeeklySummaries,
	putPlan,
	putWeeklySummary,
} from "./storage.js";
import { normalizeCalendarEvent, normalizeSummary, normalizeTask, sortTimeline } from "./timeline.js";

const SourceSchema = z.enum([
	"google_calendar",
	"google_tasks",
	"hevy",
	"concierge",
]);

const OffsetSchema = z
	.string()
	.regex(/^(Z|[+-]\d{2}:\d{2})$/)
	.default("Z")
	.describe("Timezone offset for date-only inputs, e.g. Z or -07:00");

const WorkingHoursSchema = z
	.object({
		start_hour: z.number().min(0).max(23).default(9),
		end_hour: z.number().min(1).max(24).default(17),
	})
	.optional();

export interface RegisterConciergeToolsOptions {
	env: Env;
	props: Props;
	now?: () => Date;
}

function dayStart(date: string, offset: string): string {
	return `${date}T00:00:00${offset}`;
}

function dayEnd(date: string, offset: string): string {
	return `${date}T23:59:59${offset}`;
}

function planExpiry(now: Date): string {
	return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function newPlanId(): string {
	return `plan_${crypto.randomUUID()}`;
}

function newProposalId(index: number): string {
	return `proposal_${index + 1}_${crypto.randomUUID()}`;
}

async function getGoogleClients(env: Env, userId: string) {
	const tokens = await getGoogleTokens(env, userId);
	if (!tokens) {
		throw new Error("Google is not connected. Visit /setup to connect Google Calendar and Tasks.");
	}
	return {
		tokens,
		calendar: new GoogleCalendarClient(tokens.access_token),
		tasks: new GoogleTasksClient(tokens.access_token),
	};
}

async function getDefaultTaskListId(tasks: GoogleTasksClient): Promise<string> {
	const lists = await tasks.listTaskLists();
	const list = lists[0];
	if (!list) {
		throw new Error("No Google Tasks lists are available.");
	}
	return list.id;
}

async function getTimelineItems(options: {
	env: Env;
	userId: string;
	startTime: string;
	endTime: string;
	sources?: string[];
}): Promise<{ items: TimelineItem[]; errors: string[] }> {
	const requested = new Set(options.sources ?? [
		"google_calendar",
		"google_tasks",
		"concierge",
	]);
	const items: TimelineItem[] = [];
	const errors: string[] = [];

	if (requested.has("google_calendar") || requested.has("google_tasks")) {
		try {
			const { calendar, tasks } = await getGoogleClients(options.env, options.userId);

			if (requested.has("google_calendar")) {
				try {
					const events = await calendar.listEvents({
						timeMin: options.startTime,
						timeMax: options.endTime,
					});
					items.push(...events.map(normalizeCalendarEvent));
				} catch (error) {
					errors.push(
						`google_calendar: ${error instanceof Error ? error.message : "unknown error"}`,
					);
				}
			}

			if (requested.has("google_tasks")) {
				try {
					const lists = await tasks.listTaskLists();
					for (const list of lists) {
						const listTasks = await tasks.listTasks({
							taskListId: list.id,
							dueMin: options.startTime,
							dueMax: options.endTime,
							showCompleted: true,
						});
						items.push(...listTasks.map((task) => normalizeTask(task, list.id)));
					}
				} catch (error) {
					errors.push(
						`google_tasks: ${error instanceof Error ? error.message : "unknown error"}`,
					);
				}
			}
		} catch (error) {
			errors.push(`google: ${error instanceof Error ? error.message : "not connected"}`);
		}
	}

	if (requested.has("concierge")) {
		const summaries = await listWeeklySummaries(
			options.env.CONCIERGE_KV,
			options.userId,
			options.startTime,
			options.endTime,
		);
		items.push(...summaries.map(normalizeSummary));
	}

	return { items: sortTimeline(items), errors };
}

function planResponse(plan: PlanRecord) {
	return jsonContent(`Drafted ${plan.proposals.length} proposals.`, {
		plan_id: plan.id,
		expires_at: plan.expiresAt,
		proposals: plan.proposals,
	});
}

export function registerConciergeTools(
	server: McpServer,
	options: RegisterConciergeToolsOptions,
): void {
	const now = options.now ?? (() => new Date());

	server.tool("get_connection_status", {}, async () => {
		try {
			const google = await getConnectedAccount(
				options.env.CONCIERGE_KV,
				options.env.COOKIE_ENCRYPTION_KEY,
				options.props.userId,
				GOOGLE_PROVIDER,
			);

			const googleTokens = await getGoogleTokens(options.env, options.props.userId);
			const setupUrl = options.props.baseUrl ? `${options.props.baseUrl}/setup` : "/setup";
			return jsonContent("Connection status", {
				user_id: options.props.userId,
				google: {
					connected: Boolean(google),
					calendar_ready: Boolean(
						googleTokens &&
							(hasScope(
								googleTokens,
								"https://www.googleapis.com/auth/calendar.events",
							) ||
								hasScope(
									googleTokens,
									"https://www.googleapis.com/auth/calendar.freebusy",
								)),
					),
					tasks_ready: Boolean(
						googleTokens &&
							hasScope(googleTokens, "https://www.googleapis.com/auth/tasks"),
					),
				},
				hevy: {
					connected: false,
					mode: "external_connector",
				},
				setup_url: setupUrl,
			});
		} catch (error) {
			return handleToolError(error);
		}
	});

	server.tool(
		"get_life_timeline",
		{
			start_time: z.string().describe("Inclusive ISO 8601 start time"),
			end_time: z.string().describe("Exclusive ISO 8601 end time"),
			sources: z.array(SourceSchema).optional(),
		},
		async ({ start_time, end_time, sources }) => {
			try {
				const result = await getTimelineItems({
					env: options.env,
					userId: options.props.userId,
					startTime: start_time,
					endTime: end_time,
					sources,
				});
				return jsonContent(`Retrieved ${result.items.length} timeline items.`, result);
			} catch (error) {
				return handleToolError(error);
			}
		},
	);

	server.tool(
		"find_time_windows",
		{
			start_time: z.string().describe("Inclusive ISO 8601 start time"),
			end_time: z.string().describe("Exclusive ISO 8601 end time"),
			duration_minutes: z.number().positive().default(60),
			working_hours: WorkingHoursSchema,
			max_results: z.number().positive().max(20).default(8),
		},
		async ({ start_time, end_time, duration_minutes, working_hours, max_results }) => {
			try {
				let busy: TimeBlock[] = [];
				try {
					const { calendar } = await getGoogleClients(options.env, options.props.userId);
					const blocks = await calendar.freeBusy({
						timeMin: start_time,
						timeMax: end_time,
					});
					busy = blocks.map((block) => ({
						startTime: block.start,
						endTime: block.end,
						source: "google_calendar" as const,
					}));
				} catch {
					busy = [];
				}

				const windows = findAvailableWindows({
					startTime: start_time,
					endTime: end_time,
					durationMinutes: duration_minutes,
					busy,
					constraints: {
						workingHours: working_hours
							? {
									startHour: working_hours.start_hour,
									endHour: working_hours.end_hour,
								}
							: undefined,
						maxResults: max_results,
					},
				});

				return jsonContent(`Found ${windows.length} available windows.`, {
					windows,
					busy_blocks_considered: busy.length,
				});
			} catch (error) {
				return handleToolError(error);
			}
		},
	);

	server.tool(
		"draft_day_plan",
		{
			date: z.string().describe("Date in YYYY-MM-DD format"),
			timezone_offset: OffsetSchema,
			priorities: z.array(z.string()).optional(),
			working_hours: WorkingHoursSchema,
		},
		async ({ date, timezone_offset, priorities, working_hours }) => {
			try {
				const startTime = dayStart(date, timezone_offset);
				const endTime = dayEnd(date, timezone_offset);
				const { calendar } = await getGoogleClients(options.env, options.props.userId);
				const busy = await calendar.freeBusy({ timeMin: startTime, timeMax: endTime });
				const windows = findAvailableWindows({
					startTime,
					endTime,
					durationMinutes: 60,
					busy: busy.map((block) => ({
						startTime: block.start,
						endTime: block.end,
						source: "google_calendar",
					})),
					constraints: {
						workingHours: working_hours
							? {
									startHour: working_hours.start_hour,
									endHour: working_hours.end_hour,
								}
							: { startHour: 9, endHour: 17 },
						maxResults: 4,
					},
				});

				const titles = priorities?.length ? priorities : ["Focus block"];
				const proposals = windows.slice(0, titles.length).map((window, index) =>
					buildCalendarProposal({
						id: newProposalId(index),
						title: titles[index],
						window,
						description: "Drafted by Concierge. Commit this proposal to write it.",
						metadata: { kind: "day_plan", date },
					}),
				);

				const createdAt = now().toISOString();
				const plan: PlanRecord = {
					id: newPlanId(),
					userId: options.props.userId,
					kind: "day",
					createdAt,
					expiresAt: planExpiry(new Date(createdAt)),
					proposals,
					committedProposalIds: [],
				};
				await putPlan(options.env.CONCIERGE_KV, plan);
				return planResponse(plan);
			} catch (error) {
				return handleToolError(error);
			}
		},
	);

	server.tool(
		"draft_training_week",
		{
			start_date: z.string().describe("Week start date in YYYY-MM-DD format"),
			end_date: z.string().describe("Week end date in YYYY-MM-DD format"),
			timezone_offset: OffsetSchema,
			target_sessions: z.number().positive().max(10).default(3),
			session_minutes: z.number().positive().max(240).default(75),
			title: z.string().default("Training"),
		},
		async ({
			start_date,
			end_date,
			timezone_offset,
			target_sessions,
			session_minutes,
			title,
		}) => {
			try {
				const startTime = dayStart(start_date, timezone_offset);
				const endTime = dayEnd(end_date, timezone_offset);
				const { calendar } = await getGoogleClients(options.env, options.props.userId);
				const busy = await calendar.freeBusy({ timeMin: startTime, timeMax: endTime });
				const windows = findAvailableWindows({
					startTime,
					endTime,
					durationMinutes: session_minutes,
					busy: busy.map((block) => ({
						startTime: block.start,
						endTime: block.end,
						source: "google_calendar",
					})),
					constraints: {
						workingHours: { startHour: 6, endHour: 21 },
						maxResults: target_sessions,
					},
				});

				const proposals = windows.map((window, index) =>
					buildCalendarProposal({
						id: newProposalId(index),
						title: `${title} ${index + 1}`,
						window,
						description: "Drafted by Concierge from calendar availability.",
						metadata: {
							kind: "training_week",
							start_date,
							end_date,
							session_minutes,
						},
					}),
				);

				const createdAt = now().toISOString();
				const plan: PlanRecord = {
					id: newPlanId(),
					userId: options.props.userId,
					kind: "training_week",
					createdAt,
					expiresAt: planExpiry(new Date(createdAt)),
					proposals,
					committedProposalIds: [],
				};
				await putPlan(options.env.CONCIERGE_KV, plan);
				return planResponse(plan);
			} catch (error) {
				return handleToolError(error);
			}
		},
	);

	server.tool(
		"commit_plan",
		{
			plan_id: z.string(),
			proposal_ids: z.array(z.string()).optional(),
			calendar_id: z.string().default("primary"),
		},
		async ({ plan_id, proposal_ids, calendar_id }) => {
			try {
				const plan = await getPlan(options.env.CONCIERGE_KV, options.props.userId, plan_id);
				if (!plan) {
					return textContent("Plan not found or expired.");
				}

				const selected = new Set(proposal_ids ?? plan.proposals.map((proposal) => proposal.id));
				const alreadyCommitted = new Set(plan.committedProposalIds);
				const proposals = plan.proposals.filter(
					(proposal) => selected.has(proposal.id) && !alreadyCommitted.has(proposal.id),
				);

				const { calendar } = await getGoogleClients(options.env, options.props.userId);
				const created = [];
				for (const proposal of proposals) {
					if (proposal.type !== "calendar_event" || !proposal.startTime || !proposal.endTime) {
						continue;
					}

					const event = await calendar.createEvent({
						calendarId: calendar_id,
						title: proposal.title,
						startTime: proposal.startTime,
						endTime: proposal.endTime,
						description: proposal.description,
						extendedProperties: {
							"concierge.plan_id": plan.id,
							"concierge.proposal_id": proposal.id,
							"concierge.source": "concierge",
							"concierge.created_at": now().toISOString(),
						},
					});
					created.push(event);
					plan.committedProposalIds.push(proposal.id);
				}

				await putPlan(options.env.CONCIERGE_KV, plan);
				return jsonContent(`Committed ${created.length} proposals.`, {
					created_events: created,
					skipped_already_committed: selected.size - proposals.length,
				});
			} catch (error) {
				return handleToolError(error);
			}
		},
	);

	server.tool(
		"get_weekly_review",
		{
			week_start: z.string().describe("Week start date in YYYY-MM-DD format"),
			timezone_offset: OffsetSchema,
			save_summary: z.boolean().default(false),
		},
		async ({ week_start, timezone_offset, save_summary }) => {
			try {
				const start = new Date(dayStart(week_start, timezone_offset));
				const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
				const timeline = await getTimelineItems({
					env: options.env,
					userId: options.props.userId,
					startTime: start.toISOString(),
					endTime: end.toISOString(),
					sources: ["google_calendar", "google_tasks", "concierge"],
				});
				const summary = buildWeeklySummary({
					userId: options.props.userId,
					weekStart: start.toISOString(),
					items: timeline.items,
					now: now().toISOString(),
				});

				if (save_summary) {
					await putWeeklySummary(options.env.CONCIERGE_KV, summary);
				}

				return jsonContent("Weekly review", {
					saved: save_summary,
					summary,
					source_errors: timeline.errors,
				});
			} catch (error) {
				return handleToolError(error);
			}
		},
	);

	server.tool(
		"create_calendar_event",
		{
			title: z.string(),
			start_time: z.string(),
			end_time: z.string(),
			description: z.string().optional(),
			calendar_id: z.string().default("primary"),
		},
		async ({ title, start_time, end_time, description, calendar_id }) => {
			try {
				const { calendar } = await getGoogleClients(options.env, options.props.userId);
				const event = await calendar.createEvent({
					calendarId: calendar_id,
					title,
					startTime: start_time,
					endTime: end_time,
					description,
					extendedProperties: {
						"concierge.source": "direct_tool",
						"concierge.created_at": now().toISOString(),
					},
				});
				return jsonContent(`Created calendar event: ${event.summary ?? title}`, event);
			} catch (error) {
				return handleToolError(error);
			}
		},
	);

	server.tool(
		"create_task",
		{
			title: z.string(),
			notes: z.string().optional(),
			due: z.string().optional(),
			task_list_id: z.string().optional(),
		},
		async ({ title, notes, due, task_list_id }) => {
			try {
				const { tasks } = await getGoogleClients(options.env, options.props.userId);
				const taskListId = task_list_id ?? (await getDefaultTaskListId(tasks));
				const task = await tasks.createTask({ taskListId, title, notes, due });
				return jsonContent(`Created task: ${task.title}`, task);
			} catch (error) {
				return handleToolError(error);
			}
		},
	);

	server.tool(
		"complete_task",
		{
			task_id: z.string(),
			task_list_id: z.string().optional(),
		},
		async ({ task_id, task_list_id }) => {
			try {
				const { tasks } = await getGoogleClients(options.env, options.props.userId);
				const taskListId = task_list_id ?? (await getDefaultTaskListId(tasks));
				const task = await tasks.completeTask({ taskListId, taskId: task_id });
				return jsonContent(`Completed task: ${task.title}`, task);
			} catch (error) {
				return handleToolError(error);
			}
		},
	);
}
