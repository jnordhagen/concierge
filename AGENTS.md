# Concierge

Personal assistant on the Claude Agent SDK that coordinates calendar, tasks, and
fitness over MCP. It is an MCP client (not a server) and runs as a local CLI.

## Project Rules

- Concierge is a Claude Agent SDK app, not an MCP server or a Worker. Do not
  reintroduce Hono, Cloudflare Workers, Durable Objects, or an OAuth server.
- Leverage already-built MCP servers. Hevy is consumed via its external stdio
  mode; do not copy Hevy code into this repo.
- Keep the write-safety boundary: `draft_*` / `find_time_windows` / read tools must
  never mutate upstream. Only `create_event`, `create_task`, `complete_task`, and
  `commit_plan` write to Google. `commit_plan` must stay idempotent per proposal.
- Store only encrypted Google tokens and short-lived plan proposals in
  `~/.concierge/store.json`. Do not persist raw calendar/task/workout data.
- Scope the agent to MCP tools only via `canUseTool` in `src/agent.ts`.

## Layout

- `src/cli.ts` — REPL entry (Agent SDK `query()` loop).
- `src/agent.ts` — options: model, system prompt, the three MCP servers, permission gate.
- `src/connect.ts` — one-time Google OAuth loopback (`npm run connect google`).
- `src/mcp/google-server.ts`, `src/mcp/planning-server.ts` — in-process MCP servers.
- `src/google/*` — salvaged Google OAuth + Calendar/Tasks clients.
- `src/lib/{planner,crypto,store,errors}.ts`, `src/types.ts` — scheduler, encryption, store, types.

## Commands

```bash
npm run type-check
npm run lint
npm test
```
