import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Config } from "../config.js";
import { getAccessToken } from "../google/auth.js";
import { GoogleCalendarClient } from "../google/calendar.js";
import { GoogleTasksClient } from "../google/tasks.js";
import type { FileStore } from "../lib/store.js";
import { fail, ok } from "./result.js";

/**
 * In-process MCP server exposing Google Calendar + Tasks via the salvaged clients.
 * Tools are surfaced to the agent as `mcp__google__<tool>`.
 *
 * `create_event`, `create_task`, and `complete_task` mutate upstream; everything
 * else is read-only.
 */
export function createGoogleServer(store: FileStore, config: Config) {
	const calendar = async () => new GoogleCalendarClient(await getAccessToken(store, config));
	const tasks = async () => new GoogleTasksClient(await getAccessToken(store, config));

	const defaultTaskListId = async (client: GoogleTasksClient): Promise<string> => {
		const lists = await client.listTaskLists();
		const list = lists[0];
		if (!list) {
			throw new Error("No Google Tasks lists are available.");
		}
		return list.id;
	};

	return createSdkMcpServer({
		name: "google",
		version: "0.2.0",
		tools: [
			tool("list_calendars", "List the user's Google calendars.", {}, async () => {
				try {
					return ok("Calendars", await (await calendar()).listCalendars());
				} catch (error) {
					return fail(error);
				}
			}),

			tool(
				"get_events",
				"List calendar events in an ISO 8601 time range. Read-only.",
				{
					time_min: z.string().describe("Inclusive ISO 8601 start time"),
					time_max: z.string().describe("Exclusive ISO 8601 end time"),
					calendar_id: z.string().default("primary"),
				},
				async ({ time_min, time_max, calendar_id }) => {
					try {
						const events = await (await calendar()).listEvents({
							calendarId: calendar_id,
							timeMin: time_min,
							timeMax: time_max,
						});
						return ok(`Found ${events.length} events.`, events);
					} catch (error) {
						return fail(error);
					}
				},
			),

			tool(
				"free_busy",
				"Return busy time blocks in an ISO 8601 range. Read-only; use this before scheduling.",
				{
					time_min: z.string().describe("Inclusive ISO 8601 start time"),
					time_max: z.string().describe("Exclusive ISO 8601 end time"),
					calendar_ids: z.array(z.string()).optional(),
				},
				async ({ time_min, time_max, calendar_ids }) => {
					try {
						const busy = await (await calendar()).freeBusy({
							timeMin: time_min,
							timeMax: time_max,
							calendarIds: calendar_ids,
						});
						return ok(`Found ${busy.length} busy blocks.`, busy);
					} catch (error) {
						return fail(error);
					}
				},
			),

			tool(
				"create_event",
				"Create a calendar event. WRITES to Google Calendar — only call when the user has confirmed the event.",
				{
					title: z.string(),
					start_time: z.string().describe("ISO 8601 start"),
					end_time: z.string().describe("ISO 8601 end"),
					description: z.string().optional(),
					calendar_id: z.string().default("primary"),
				},
				async ({ title, start_time, end_time, description, calendar_id }) => {
					try {
						const event = await (await calendar()).createEvent({
							calendarId: calendar_id,
							title,
							startTime: start_time,
							endTime: end_time,
							description,
							extendedProperties: {
								"concierge.source": "direct_tool",
								"concierge.created_at": new Date().toISOString(),
							},
						});
						return ok(`Created event: ${event.summary ?? title}`, event);
					} catch (error) {
						return fail(error);
					}
				},
			),

			tool("list_task_lists", "List the user's Google task lists.", {}, async () => {
				try {
					return ok("Task lists", await (await tasks()).listTaskLists());
				} catch (error) {
					return fail(error);
				}
			}),

			tool(
				"list_tasks",
				"List tasks in a task list (defaults to the first list). Read-only.",
				{
					task_list_id: z.string().optional(),
					due_min: z.string().optional().describe("ISO 8601 lower bound on due date"),
					due_max: z.string().optional().describe("ISO 8601 upper bound on due date"),
					show_completed: z.boolean().default(true),
				},
				async ({ task_list_id, due_min, due_max, show_completed }) => {
					try {
						const client = await tasks();
						const listId = task_list_id ?? (await defaultTaskListId(client));
						const items = await client.listTasks({
							taskListId: listId,
							dueMin: due_min,
							dueMax: due_max,
							showCompleted: show_completed,
						});
						return ok(`Found ${items.length} tasks in ${listId}.`, items);
					} catch (error) {
						return fail(error);
					}
				},
			),

			tool(
				"create_task",
				"Create a task. WRITES to Google Tasks — only call when the user has confirmed it.",
				{
					title: z.string(),
					notes: z.string().optional(),
					due: z.string().optional().describe("RFC 3339 due timestamp"),
					task_list_id: z.string().optional(),
				},
				async ({ title, notes, due, task_list_id }) => {
					try {
						const client = await tasks();
						const listId = task_list_id ?? (await defaultTaskListId(client));
						const task = await client.createTask({ taskListId: listId, title, notes, due });
						return ok(`Created task: ${task.title}`, task);
					} catch (error) {
						return fail(error);
					}
				},
			),

			tool(
				"complete_task",
				"Mark a task complete. WRITES to Google Tasks.",
				{
					task_id: z.string(),
					task_list_id: z.string().optional(),
				},
				async ({ task_id, task_list_id }) => {
					try {
						const client = await tasks();
						const listId = task_list_id ?? (await defaultTaskListId(client));
						const task = await client.completeTask({ taskListId: listId, taskId: task_id });
						return ok(`Completed task: ${task.title}`, task);
					} catch (error) {
						return fail(error);
					}
				},
			),
		],
	});
}
