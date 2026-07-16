# Kosha

A self-hosted Telegram expense tracker + net worth toolkit. Each person deploys
their own copy — their own bot, their own database, their own dashboard.
Nothing shared, nothing sold, nothing seen by anyone else.

Full product reasoning, design decisions, and priority list live in the
project's Notion workspace (Product Discovery, Decision Log, PRD, Technical
Architecture, Design Discovery, Bot Conversation Design, Setup Guide).

## Status

**Phase 1 skeleton** — not yet deployed anywhere. What exists so far:

- Telegram webhook + message handling (`src/bot.ts`, `src/index.ts`)
- Parsing engine for typed entries and two starter bank templates, HDFC and
  Axis (`src/parsing/`) — these are *starting* templates based on typical
  formats, not yet verified against real (redacted) bank messages. That's
  the next real risk to close before this goes further.
- D1 schema for accounts, transactions, categories, investments, settings
  (`src/db/schema.ts`, `migrations/0000_init.sql`)
- Starter Smart Rules category set
- A one-time `/setup/webhook` route that registers the Telegram webhook from
  Cloudflare's own infrastructure (works around this dev environment not
  having direct network access to Telegram's API)
- The approved dashboard mockup, as static HTML with sample data
  (`dashboard/index.html`) — not yet wired to real data

## Not built yet (see the PRD for the full P0/P1/P2 list)

- PIN hashing + dashboard auth
- Dashboard wired to real D1 data (currently sample data only)
- CAS upload + browser-side pdf.js parsing
- Daily/monthly nudges (cron trigger is configured in `wrangler.toml`, handler not written)
- `/review`, `/export`, `/forgotpin`, `/resetpin`, `/investments` commands (stubs only so far)
- Refund/reversal detection
- Master toolkit version-check flow

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in your real bot token
wrangler d1 create kosha-db      # first time only — copy the returned database_id into wrangler.toml
npm run db:migrate:local
npm test
npm run dev
```

## Deploying

See the Setup Guide in Notion for the full walkthrough (GitHub account,
Cloudflare account, BotFather steps, PIN setup, CAS opt-in). Short version:

```bash
wrangler d1 create kosha-db          # once, then update wrangler.toml with the database_id
npm run db:migrate:remote
wrangler deploy
# then hit https://<your-worker>.workers.dev/setup/webhook once, with BOT_TOKEN
# already set via `wrangler secret put BOT_TOKEN`
```
