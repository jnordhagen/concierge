import type { Options, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { Config } from "./config.js";
import { createGoogleServer } from "./mcp/google-server.js";
import { createPlanningServer } from "./mcp/planning-server.js";
import { FileStore } from "./lib/store.js";

const SYSTEM_PROMPT = `You are Concierge, a personal assistant that coordinates the user's calendar, tasks, and fitness training.

You have three tool sources, all exposed as MCP tools:
- google: Google Calendar + Tasks (mcp__google__*)
- planning: deterministic scheduling and plan drafting (mcp__planning__*)
- hevy: the user's Hevy fitness/workout data (mcp__hevy__*)

Core operating rules:
- Reason over the raw tool output yourself; there is no separate timeline or summary tool.
- The write-safety boundary is important. Tools named draft_* and find_time_windows and any get_/list_/free_busy tool NEVER change anything. Only create_event, create_task, complete_task (google) and commit_plan (planning) write to the user's accounts.
- For multi-event scheduling, prefer the draft -> review -> commit flow: draft a plan, show the proposals to the user, and only call commit_plan after they confirm.
- Before scheduling, check availability with free_busy or find_time_windows rather than guessing.
- Always resolve relative dates ("tomorrow", "this week") to explicit ISO 8601 using the user's local time, and state the absolute date back to the user.
- Be concise. Lead with the answer or the action taken.`;

/**
 * Build the Claude Agent SDK options: model, system prompt, the three MCP servers
 * (Hevy as an external stdio subprocess; Google + planning in-process), and a
 * permission gate that allows only our MCP tools — no built-in file/bash tools.
 */
export function buildAgentOptions(config: Config): Options {
	const store = new FileStore(config.storePath, config.encryptionKey);

	// Allow only our MCP tools; deny any built-in (file/bash/etc.) tool.
	const canUseTool = async (
		toolName: string,
		input: Record<string, unknown>,
	): Promise<PermissionResult> => {
		if (toolName.startsWith("mcp__")) {
			return { behavior: "allow", updatedInput: input };
		}
		return {
			behavior: "deny",
			message: `Tool ${toolName} is not available to Concierge.`,
		};
	};

	const hevyEnv: Record<string, string> = { HEVY_API_KEY: config.hevyApiKey };
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) {
			hevyEnv[key] = value;
		}
	}

	return {
		model: config.model,
		systemPrompt: SYSTEM_PROMPT,
		// Restrict to only our MCP servers; ignore any project/user .mcp.json.
		strictMcpConfig: true,
		mcpServers: {
			hevy: {
				type: "stdio",
				command: "npx",
				args: ["tsx", config.hevyMcpEntry],
				env: hevyEnv,
			},
			google: createGoogleServer(store, config),
			planning: createPlanningServer(store, config),
		},
		canUseTool,
	};
}
