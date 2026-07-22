# Kosha

A self-hosted Telegram expense tracker + net worth toolkit. Each person deploys
their own copy — their own bot, their own database, their own dashboard.
Nothing shared, nothing sold, nothing seen by anyone else.

Full product reasoning, design decisions, and priority list live in the
project's Notion workspace (Product Discovery, Decision Log, PRD, Technical
Architecture, Design Discovery, Bot Conversation Design, Setup Guide).

## Status

**Deployed and in daily use.** What exists so far:

- Telegram webhook + message handling (`src/bot.ts`, `src/index.ts`)
- Parsing engine for typed entries and starter bank templates — HDFC (account
  + card), ICICI (account + card), and Axis (`src/parsing/`) — verified
  against real (redacted) bank messages as they come in; anything a template
  misses lands in `/review`/the dashboard's "Needs review" panel instead of
  being lost.
- D1 schema for accounts, transactions, categories, investments, settings
  (`src/db/schema.ts`, `migrations/`)
- Starter Smart Rules category set
- A one-time `/setup/webhook` route that registers the Telegram webhook from
  Cloudflare's own infrastructure (works around this dev environment not
  having direct network access to Telegram's API)
- PIN hashing + dashboard auth (`src/auth.ts`), with brute-force lockout
- Dashboard wired to real D1 data — balances, spend, category breakdown, top
  merchants, monthly trend, recent transactions (`dashboard/index.html`,
  `src/dashboard-data.ts`)
- A "Needs review" panel on the dashboard, and `/review`, `/fix`, `/discard`
  in Telegram — two ways to resolve anything marked unparsed
- Daily evening check-in + monthly close-out nudges via the cron trigger
  (`src/nudges.ts`)
- `/export` (full history as CSV), `/forgotpin`, `/resetpin`
- Refund/reversal detection (`src/refunds.ts`) — a credit that matches a
  recent debit (same amount, same/similar vendor, within 7 days) prompts a
  yes/no in Telegram to net it against the original expense instead of
  counting it as new income

## Not built yet (see the PRD for the full P0/P1/P2 list)

- CAS upload + browser-side pdf.js parsing
- `/investments` command (manual SIP/stock/FD/RD entry)
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
