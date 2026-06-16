# Concierge Handoff

## Current State

Concierge has been scaffolded as a standalone Cloudflare Workers MCP server at:

```text
/Users/jakob/Dev/projects/concierge
```

It is intentionally separate from the Hevy MCP project. Hevy should remain an
external fitness connector/signal, not code moved into Concierge.

## What Exists

- Cloudflare Workers + Hono app
- MCP server using `agents` + `@modelcontextprotocol/sdk`
- Durable Object binding for MCP sessions
- Owner-token login for setup
- MCP bearer auth and OAuth-style authorization endpoints
- Setup UI at `/setup`
- Google OAuth connection flow
- Google Calendar client
- Google Tasks client
- Encrypted connected-account storage in KV
- Short-lived proposal storage in KV
- Compact weekly summary storage in KV
- Planning utilities for finding open windows
- MCP tools for status, timeline, planning, committing proposals, reviews, events, and tasks
- Tests for planner, storage, and review behavior

## Key Project Rules

These are also captured in `AGENTS.md`.

- Concierge is standalone.
- Do not move Hevy MCP code into this repo.
- Treat Hevy as an external MCP/server connector later.
- Draft tools must not write upstream data.
- Only explicit commit/create/complete tools may mutate Google Calendar or Google Tasks.
- Store encrypted tokens, short-lived proposals, and compact summaries only.
- Do not store raw calendar events, task bodies, workout records, or a normalized raw-data ledger in v1.

## Verified Commands

These passed after scaffolding:

```bash
npm run type-check
npm run lint
npm test
```

Test result at handoff:

```text
3 test files passed
5 tests passed
```

## Important Files

- `README.md`: setup and high-level project description
- `AGENTS.md`: repo instructions for future Codex runs
- `package.json`: scripts and dependency versions
- `wrangler.jsonc`: Worker, Durable Object, and KV config
- `.dev.vars.example`: required local secrets
- `src/app.ts`: Hono app composition
- `src/mcp-agent.ts`: Concierge MCP Durable Object
- `src/lib/tools.ts`: MCP tool registration
- `src/lib/google-auth.ts`: Google OAuth and token refresh
- `src/lib/google-calendar.ts`: Google Calendar API client
- `src/lib/google-tasks.ts`: Google Tasks API client
- `src/lib/storage.ts`: encrypted KV storage, plans, summaries
- `src/lib/planner.ts`: available-window logic
- `src/lib/timeline.ts`: normalized timeline items
- `src/lib/review.ts`: weekly review summary generation
- `test/`: focused unit tests

## Local Setup Needed

Create `.dev.vars` from the example:

```bash
cp .dev.vars.example .dev.vars
```

Fill in:

```text
OWNER_TOKEN=...
COOKIE_ENCRYPTION_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

`COOKIE_ENCRYPTION_KEY` must be a 64-character hex string.

The KV namespace IDs in `wrangler.jsonc` are valid-shaped placeholders:

```text
00000000000000000000000000000000
11111111111111111111111111111111
```

Replace them with real Cloudflare KV namespace IDs before real remote dev or
deployment.

## Google OAuth Setup Needed

Create a Google OAuth client and enable:

- Google Calendar API
- Google Tasks API

Use this local redirect URI for Wrangler dev:

```text
http://localhost:8788/connections/google/callback
```

Production redirect URI should match the deployed Worker origin:

```text
https://<your-worker-origin>/connections/google/callback
```

The current scope set is in `src/lib/google-auth.ts`.

## How To Resume

In a new Codex thread rooted at `/Users/jakob/Dev/projects/concierge`, start with:

```text
Read AGENTS.md and HANDOFF.md first. Then verify the project with npm run type-check, npm run lint, and npm test. After that, help me configure local dev and test the Google connection flow.
```

## Recommended Next Steps

1. Initialize git in this standalone repo if desired.
2. Fill `.dev.vars`.
3. Replace KV namespace placeholders or create dev KV namespaces.
4. Run `npm start`.
5. Open `/setup` and test owner login.
6. Connect Google Calendar and Tasks.
7. Test MCP auth with owner bearer token.
8. Test `get_connection_status`, `find_time_windows`, and `draft_day_plan`.
9. Add integration-style mocked tests for Google OAuth callback and MCP tools.
10. Add the Hevy external connector path once the Google flow is proven.

## Known Gaps

- No live Google OAuth flow has been tested yet.
- No Wrangler dev server has been started yet.
- No production Cloudflare resources have been created from this thread.
- Hevy is not wired in yet; it is intentionally left external for v1.
- Weekly reviews currently summarize visible Calendar/Tasks/summary data and have a placeholder path for future Hevy workout signals.
- The setup UI is functional and plain, not polished.
