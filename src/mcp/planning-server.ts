import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Config } from "../config.js";
import { getAccessToken } from "../google/auth.js";
import { GoogleCalendarClient } from "../google/calendar.js";
import { buildCalendarProposal, findAvailableWindows } from "../lib/planner.js";
import type { FileStore } from "../lib/store.js";
import type { PlanRecord, TimeBlock } from "../types.js";
import { fail, ok } from "./result.js";

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

const dayStart = (date: string, offset: string) => `${date}T00:00:00${offset}`;
const dayEnd = (date: string, offset: string) => `${date}T23:59:59${offset}`;
const planExpiry = (now: Date) => new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
const newPlanId = () => `plan_${crypto.randomUUID()}`;
const newProposalId = (index: number) => `proposal_${index + 1}_${crypto.randomUUID()}`;

/**
 * In-process MCP server for deterministic scheduling and the draft -> commit
 * write-safety boundary. Tools are surfaced as `mcp__planning__<tool>`.
 *
 * `find_time_windows`, `draft_day_plan`, and `draft_training_week` NEVER write
 * upstream — they only compute and persist proposals. `commit_plan` is the only
 * tool here that writes calendar events, and it is idempotent per proposal.
 */
export function createPlanningServer(store: FileStore, config: Config) {
	const calendarClient = async () =>
		new GoogleCalendarClient(await getAccessToken(store, config));

	const busyBlocks = async (timeMin: string, timeMax: string): Promise<TimeBlock[]> => {
		const blocks = await (await calendarClient()).freeBusy({ timeMin, timeMax });
		return blocks.map((block) => ({
			startTime: block.start,
			endTime: block.end,
			source: "google_calendar" as const,
		}));
	};

	const savePlan = async (
		kind: PlanRecord["kind"],
		proposals: PlanRecord["proposals"],
	): Promise<PlanRecord> => {
		const createdAt = new Date().toISOString();
		const plan: PlanRecord = {
			id: newPlanId(),
			kind,
			createdAt,
			expiresAt: planExpiry(new Date(createdAt)),
			proposals,
			committedProposalIds: [],
		};
		await store.putPlan(plan);
		return plan;
	};

	const planResponse = (plan: PlanRecord) =>
		ok(`Drafted ${plan.proposals.length} proposals (commit with commit_plan).`, {
			plan_id: plan.id,
			expires_at: plan.expiresAt,
			proposals: plan.proposals,
		});

	return createSdkMcpServer({
		name: "planning",
		version: "0.2.0",
		tools: [
			tool(
				"find_time_windows",
				"Find open calendar windows of a given duration. Read-only; computes gaps from free/busy.",
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
							busy = await busyBlocks(start_time, end_time);
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
									? { startHour: working_hours.start_hour, endHour: working_hours.end_hour }
									: undefined,
								maxResults: max_results,
							},
						});
						return ok(`Found ${windows.length} available windows.`, {
							windows,
							busy_blocks_considered: busy.length,
						});
					} catch (error) {
						return fail(error);
					}
				},
			),

			tool(
				"draft_day_plan",
				"Draft focus blocks for a day from open windows. Does NOT write to the calendar — returns proposals to commit.",
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
						const windows = findAvailableWindows({
							startTime,
							endTime,
							durationMinutes: 60,
							busy: await busyBlocks(startTime, endTime),
							constraints: {
								workingHours: working_hours
									? { startHour: working_hours.start_hour, endHour: working_hours.end_hour }
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
						return planResponse(await savePlan("day", proposals));
					} catch (error) {
						return fail(error);
					}
				},
			),

			tool(
				"draft_training_week",
				"Draft training sessions across a week from open windows. Does NOT write to the calendar — returns proposals to commit.",
				{
					start_date: z.string().describe("Week start date YYYY-MM-DD"),
					end_date: z.string().describe("Week end date YYYY-MM-DD"),
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
						const windows = findAvailableWindows({
							startTime,
							endTime,
							durationMinutes: session_minutes,
							busy: await busyBlocks(startTime, endTime),
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
								metadata: { kind: "training_week", start_date, end_date, session_minutes },
							}),
						);
						return planResponse(await savePlan("training_week", proposals));
					} catch (error) {
						return fail(error);
					}
				},
			),

			tool(
				"commit_plan",
				"Write a drafted plan's proposals to Google Calendar. Idempotent: already-committed proposals are skipped. This is the only planning tool that mutates the calendar.",
				{
					plan_id: z.string(),
					proposal_ids: z.array(z.string()).optional().describe("Defaults to all proposals in the plan"),
					calendar_id: z.string().default("primary"),
				},
				async ({ plan_id, proposal_ids, calendar_id }) => {
					try {
						const plan = await store.getPlan(plan_id);
						if (!plan) {
							return ok("Plan not found or expired.");
						}

						const selected = new Set(
							proposal_ids ?? plan.proposals.map((proposal) => proposal.id),
						);
						const alreadyCommitted = new Set(plan.committedProposalIds);
						const toCommit = plan.proposals.filter(
							(proposal) => selected.has(proposal.id) && !alreadyCommitted.has(proposal.id),
						);

						const calendar = await calendarClient();
						const created = [];
						for (const proposal of toCommit) {
							if (
								proposal.type !== "calendar_event" ||
								!proposal.startTime ||
								!proposal.endTime
							) {
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
									"concierge.created_at": new Date().toISOString(),
								},
							});
							created.push(event);
							plan.committedProposalIds.push(proposal.id);
						}

						await store.putPlan(plan);
						return ok(`Committed ${created.length} proposals.`, {
							created_events: created,
							skipped_already_committed: selected.size - toCommit.length,
						});
					} catch (error) {
						return fail(error);
					}
				},
			),
		],
	});
}
