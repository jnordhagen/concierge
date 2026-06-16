# Concierge

Standalone MCP server for coordinating calendar, tasks, fitness signals, plans,
and summaries.

## Project Rules

- Keep Concierge standalone. Do not move Hevy MCP code into this project.
- Treat Hevy as an external connector or external MCP server.
- Draft tools must not mutate upstream systems.
- Only explicit commit/create/complete tools may write to Google Calendar or
  Google Tasks.
- Store encrypted connected-account tokens, short-lived plan proposals, and
  compact summaries only.
- Do not persist raw calendar events, task bodies, workout records, or a
  normalized raw-data ledger in v1.

## Commands

```bash
npm run type-check
npm run lint
npm test
```

## Local Development

- Copy `.dev.vars.example` to `.dev.vars`.
- Set `OWNER_TOKEN`, `COOKIE_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, and
  `GOOGLE_CLIENT_SECRET`.
- Run `npm start`.
- Open `/setup` to connect Google Calendar and Tasks.
