import { homedir } from "node:os";
import { join } from "node:path";
import "dotenv/config";

export interface Config {
	anthropicApiKey: string;
	googleClientId: string;
	googleClientSecret: string;
	encryptionKey: string;
	hevyApiKey: string;
	model: string;
	hevyMcpEntry: string;
	googleOauthPort: number;
	storePath: string;
	googleRedirectUri: string;
}

function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
		);
	}
	return value;
}

/**
 * Load config for running the agent. `requireAll: false` is used by the connect
 * command, which only needs Google + encryption settings (not the Hevy/Anthropic keys).
 */
export function loadConfig(options: { requireAll?: boolean } = {}): Config {
	const requireAll = options.requireAll ?? true;
	const port = Number(process.env.GOOGLE_OAUTH_PORT ?? "8788");

	return {
		anthropicApiKey: requireAll ? required("ANTHROPIC_API_KEY") : (process.env.ANTHROPIC_API_KEY ?? ""),
		googleClientId: required("GOOGLE_CLIENT_ID"),
		googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
		encryptionKey: required("CONCIERGE_ENCRYPTION_KEY"),
		hevyApiKey: requireAll ? required("HEVY_API_KEY") : (process.env.HEVY_API_KEY ?? ""),
		model: process.env.CONCIERGE_MODEL ?? "claude-sonnet-4-6",
		hevyMcpEntry:
			process.env.HEVY_MCP_ENTRY ?? "/Users/jakob/dev/projects/hevy/src/local.ts",
		googleOauthPort: port,
		storePath: join(homedir(), ".concierge", "store.json"),
		googleRedirectUri: `http://localhost:${port}/callback`,
	};
}
