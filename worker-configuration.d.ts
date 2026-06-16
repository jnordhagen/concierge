declare namespace Cloudflare {
	interface Env {
		MCP_OBJECT: DurableObjectNamespace;
		CONCIERGE_KV: KVNamespace;
		OWNER_TOKEN: string;
		COOKIE_ENCRYPTION_KEY: string;
		GOOGLE_CLIENT_ID: string;
		GOOGLE_CLIENT_SECRET: string;
	}
}
