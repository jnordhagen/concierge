import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import type { Env, Props } from "./types.js";
import { registerConciergeTools } from "./lib/tools.js";

export class ConciergeMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Concierge",
		version: "0.1.0",
		description:
			"Personal life coordination MCP server for calendar, tasks, proposals, and summaries.",
	});

	async init() {
		if (!this.props?.userId) {
			throw new Error("Authentication required.");
		}

		registerConciergeTools(this.server, {
			env: this.env,
			props: this.props,
		});
	}
}
