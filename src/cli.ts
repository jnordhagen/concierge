import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildAgentOptions } from "./agent.js";
import { loadConfig } from "./config.js";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function main(): Promise<void> {
	const config = loadConfig();
	const baseOptions = buildAgentOptions(config);

	const rl = createInterface({ input: stdin, output: stdout });
	stdout.write(
		`${BOLD}Concierge${RESET} — calendar, tasks & fitness assistant (model: ${config.model})\n` +
			`${DIM}Type a request. Ctrl+C or "exit" to quit.${RESET}\n\n`,
	);

	let sessionId: string | undefined;

	for (;;) {
		const line = (await rl.question("you › ")).trim();
		if (!line) {
			continue;
		}
		if (line === "exit" || line === "quit") {
			break;
		}

		try {
			const response = query({
				prompt: line,
				options: sessionId ? { ...baseOptions, resume: sessionId } : baseOptions,
			});

			let wroteText = false;
			for await (const message of response) {
				if ("session_id" in message && message.session_id) {
					sessionId = message.session_id;
				}

				if (message.type === "assistant") {
					for (const block of message.message.content) {
						if (block.type === "text" && block.text.trim()) {
							if (!wroteText) {
								stdout.write("\nconcierge › ");
								wroteText = true;
							}
							stdout.write(block.text);
						} else if (block.type === "tool_use") {
							stdout.write(`\n${DIM}[${block.name}]${RESET}`);
							wroteText = false;
						}
					}
				} else if (message.type === "result" && message.subtype !== "success") {
					stdout.write(`\n${DIM}[run ended: ${message.subtype}]${RESET}`);
				}
			}
			stdout.write("\n\n");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			stdout.write(`\n${DIM}Error: ${detail}${RESET}\n\n`);
		}
	}

	rl.close();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
