import { Hono } from "hono";
import { serve } from "@hono/node-server";

const PORT = Number(process.env.OBSERVATORY_PORT || 3099);
const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Observatory on http://localhost:${PORT}`);
});

export { app };
