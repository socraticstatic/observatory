import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { insertEvent } from "./db.js";
import { subscribe, broadcast } from "./sse.js";
import { summarize } from "./summary.js";

const PORT   = Number(process.env.OBSERVATORY_PORT || 3099);
const SECRET = process.env.LITELLM_CALLBACK_SECRET ?? "litellm-webhook-secret";

const app = new Hono();

// Auth for ingest only
app.use("/api/ingest", async (c, next) => {
  if (c.req.header("x-litellm-signature") !== SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

// Health
app.get("/healthz", (c) => c.json({ status: "ok" }));

// Ingest
app.post("/api/ingest", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const { project, provider, model, status, ts } = body;
  if (!project || !provider || !model || !status || !ts) {
    return c.json({ error: "missing required fields: project, provider, model, status, ts" }, 400);
  }
  try {
    insertEvent(body as any);
    broadcast();
    return c.json({ ok: true });
  } catch (err) {
    console.error("ingest error", err);
    return c.json({ error: "internal error" }, 500);
  }
});

// Summary
app.get("/api/summary", (c) => {
  const range = (c.req.query("range") ?? "today") as "today" | "7d" | "30d";
  return c.json(summarize(range));
});

// SSE — push "ping" to all open tabs on every ingest
app.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: "connected" });
    await new Promise<void>((resolve) => {
      const unsub = subscribe((data) => {
        stream.writeSSE({ data }).catch(resolve);
      });
      stream.onAbort(() => { unsub(); resolve(); });
    });
  });
});

// Static dashboard (built to src/public/)
app.use("/*", serveStatic({ root: "./src/public" }));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Observatory on http://localhost:${PORT}`);
});

export { app };
