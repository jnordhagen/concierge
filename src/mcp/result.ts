import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpstreamApiError } from "../lib/errors.js";

/** Success result: a one-line summary plus optional pretty-printed JSON payload. */
export function ok(summary: string, value?: unknown): CallToolResult {
	const text =
		value === undefined ? summary : `${summary}\n${JSON.stringify(value, null, 2)}`;
	return { content: [{ type: "text", text }] };
}

/** Error result the model can read and react to. */
export function fail(error: unknown): CallToolResult {
	if (error instanceof UpstreamApiError) {
		return {
			content: [
				{
					type: "text",
					text: `Upstream API error ${error.status}: ${error.message}\n${JSON.stringify(error.data, null, 2)}`,
				},
			],
			isError: true,
		};
	}
	const message = error instanceof Error ? error.message : "Unknown error";
	return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
