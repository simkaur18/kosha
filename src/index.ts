import { Hono } from "hono";
import { webhookCallback } from "grammy";
import { createBot, Env } from "./bot";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text(`Kosha toolkit — running (v${c.env.TOOLKIT_VERSION ?? "dev"})`));

// Telegram webhook target — set once during setup with Telegram's
// setWebhook API, pointed at https://<your-worker>.workers.dev/telegram.
app.post("/telegram", async (c) => {
  const bot = createBot(c.env);
  return webhookCallback(bot, "hono")(c);
});

// One-time setup route: registers this Worker's URL as the bot's webhook.
// Runs on Cloudflare's own infrastructure, not from a dev machine — sidesteps
// needing direct network access to Telegram's API from anywhere else.
app.post("/setup/webhook", async (c) => {
  const url = new URL(c.req.url);
  const webhookUrl = `${url.protocol}//${url.host}/telegram`;
  const res = await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await res.json();
  return c.json(data);
});

export default app;
