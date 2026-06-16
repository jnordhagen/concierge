# Concierge

Concierge is a personal assistant built on the **Claude Agent SDK** that coordinates
your calendar, tasks, and fitness training. It is an MCP *client*: it reasons over
tool output from three MCP servers and keeps a deterministic scheduler plus a
draft → commit write-safety boundary.

## Architecture

```
terminal (src/cli.ts)
   │  Claude Agent SDK query() loop
   ├─ hevy      external stdio MCP  → Hevy's local mode (HEVY_API_KEY)
   ├─ google    in-process MCP      → Google Calendar + Tasks (salvaged clients)
   └─ planning  in-process MCP      → find_time_windows, draft_*, commit_plan
        │
   ~/.concierge/store.json (AES-GCM encrypted: Google tokens, plan proposals)
```

Only `create_event` / `create_task` / `complete_task` (google) and `commit_plan`
(planning) write upstream. Every `draft_*`, `find_time_windows`, and read tool is
side-effect free. The permission gate (`canUseTool` in [src/agent.ts](src/agent.ts))
restricts the agent to these MCP tools only — no built-in file/bash tools.

## Tools

- **google**: `list_calendars`, `get_events`, `free_busy`, `create_event`,
  `list_task_lists`, `list_tasks`, `create_task`, `complete_task`
- **planning**: `find_time_windows`, `draft_day_plan`, `draft_training_week`, `commit_plan`
- **hevy**: the Hevy server's full fitness toolset (workouts, routines, analytics, …)

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `CONCIERGE_ENCRYPTION_KEY` (64-hex), `HEVY_API_KEY`.
   Generate the key with:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. Add `http://localhost:8788/callback` as an authorized redirect URI on your Google
   OAuth client (enable the Calendar and Tasks APIs).
4. Connect Google (one-time, opens a browser): `npm run connect google`
5. Start the assistant: `npm start`

The Hevy MCP server is spawned automatically via its local stdio mode
(`HEVY_MCP_ENTRY`, default `/Users/jakob/dev/projects/hevy/src/local.ts`).

## Commands

```bash
npm start              # run the assistant REPL
npm run connect google # one-time Google OAuth
npm run type-check
npm test
npm run lint
```
