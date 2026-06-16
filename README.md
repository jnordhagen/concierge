# Concierge

Concierge is a standalone Model Context Protocol (MCP) server for coordinating
life signals across calendar, tasks, fitness, and lightweight summaries.

It is intentionally separate from the Hevy MCP server. Hevy remains a focused
fitness connector; Concierge owns the cross-domain layer that turns calendar
availability, tasks, workouts, and summaries into plans and reviews.

## V1 Capabilities

- Remote MCP server on Cloudflare Workers
- Personal owner auth for setup and MCP clients
- Google Calendar connected account
- Google Tasks connected account
- Normalized life timeline across calendar, tasks, and summaries
- Proposal-based planning with explicit commit tools
- Weekly reviews saved as compact summaries

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
```

3. Fill in:

- `OWNER_TOKEN`: personal secret for setup and bearer auth
- `COOKIE_ENCRYPTION_KEY`: 64-character hex string
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

4. Start the Worker:

```bash
npm start
```

Setup page:

```text
http://localhost:8788/setup
```

MCP endpoint:

```text
http://localhost:8788/mcp
```

## MCP Tools

- `get_connection_status`
- `get_life_timeline`
- `find_time_windows`
- `draft_day_plan`
- `draft_training_week`
- `commit_plan`
- `get_weekly_review`
- `create_calendar_event`
- `create_task`
- `complete_task`

Draft tools never write upstream data. They save short-lived proposals in KV.
Only explicit commit/create/complete tools mutate Google Calendar or Tasks.

## Storage

Concierge stores encrypted connected-account tokens, short-lived plan proposals,
and compact summaries. It does not persist raw calendar events, task lists, or
workout records.
