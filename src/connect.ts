import { exec } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { buildGoogleAuthorizationUrl, exchangeGoogleCode } from "./google/auth.js";
import { FileStore } from "./lib/store.js";
import { loadConfig } from "./config.js";

function openBrowser(url: string): void {
	const command =
		process.platform === "darwin"
			? `open "${url}"`
			: process.platform === "win32"
				? `start "" "${url}"`
				: `xdg-open "${url}"`;
	exec(command, (error) => {
		if (error) {
			// Non-fatal: the URL is also printed for manual opening.
		}
	});
}

async function connectGoogle(): Promise<void> {
	const config = loadConfig({ requireAll: false });
	const store = new FileStore(config.storePath, config.encryptionKey);
	const state = randomBytes(16).toString("hex");

	const authUrl = buildGoogleAuthorizationUrl({
		clientId: config.googleClientId,
		redirectUri: config.googleRedirectUri,
		state,
	});

	await new Promise<void>((resolve, reject) => {
		const server = createServer(async (req, res) => {
			if (!req.url?.startsWith("/callback")) {
				res.writeHead(404).end("Not found");
				return;
			}
			const url = new URL(req.url, config.googleRedirectUri);
			const code = url.searchParams.get("code");
			const returnedState = url.searchParams.get("state");
			const errorParam = url.searchParams.get("error");

			const finish = (status: number, message: string) => {
				res.writeHead(status, { "Content-Type": "text/html" });
				res.end(`<html><body style="font-family:sans-serif"><h2>${message}</h2><p>You can close this tab.</p></body></html>`);
			};

			try {
				if (errorParam) {
					throw new Error(`Google returned: ${errorParam}`);
				}
				if (!code || returnedState !== state) {
					throw new Error("Missing code or state mismatch.");
				}
				const tokens = await exchangeGoogleCode({
					clientId: config.googleClientId,
					clientSecret: config.googleClientSecret,
					redirectUri: config.googleRedirectUri,
					code,
				});
				if (!tokens.refresh_token) {
					throw new Error(
						"No refresh token returned. Revoke prior access at https://myaccount.google.com/permissions and retry.",
					);
				}
				await store.setGoogleTokens(tokens);
				finish(200, "Google connected ✓");
				server.close();
				console.log(`Google connected. Tokens saved to ${config.storePath}`);
				resolve();
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				finish(500, `Connection failed: ${detail}`);
				server.close();
				reject(error instanceof Error ? error : new Error(detail));
			}
		});

		server.on("error", reject);
		server.listen(config.googleOauthPort, () => {
			console.log(`Listening on ${config.googleRedirectUri}`);
			console.log("Opening browser for Google consent. If it does not open, visit:\n");
			console.log(`  ${authUrl}\n`);
			openBrowser(authUrl);
		});
	});
}

const provider = process.argv[2] ?? "google";
if (provider !== "google") {
	console.error(`Unknown provider "${provider}". Only "google" is supported.`);
	process.exit(1);
}

connectGoogle().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
