import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { calibreClient } from "./calibre.ts";
import { openDb } from "./db.ts";

const env = process.env;
const port = Number(env.PORT ?? 3000);
const host = env.HOST ?? "0.0.0.0";

const app = createApp({
  db: openDb(env.DATABASE_PATH ?? "./data/kindle-dashboard.db"),
  allowSignup: env.ALLOW_SIGNUP !== "false",
  secureCookies: env.SECURE_COOKIES === "true",
  baseUrl: env.BASE_URL?.replace(/\/$/, ""),
  calibre: env.CALIBRE_URL
    ? calibreClient({ url: env.CALIBRE_URL, username: env.CALIBRE_USER, password: env.CALIBRE_PASSWORD })
    : undefined,
});

serve({ fetch: app.fetch, port, hostname: host }, () => {
  console.log(`Kindle Dashboard running on http://${host}:${port}`);
});
