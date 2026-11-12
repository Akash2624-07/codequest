import express, { type Express } from "express";

// Builds the app without listening, so tests (Day 6) can import it and send
// requests through supertest without opening a port. main.ts does the
// listening. A factory instead of a module-level `app` gives every caller a
// fresh instance, and later Days can pass config and clients in as arguments.
export function createApp(): Express {
  const app = express();

  // Every route lives under /api (architecture §2.11): in production nginx
  // forwards /api/* here, and in dev Vite's proxy does the same.
  const api = express.Router();

  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", api);
  return app;
}
