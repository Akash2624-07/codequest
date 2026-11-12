import { once } from "node:events";
import { createApp } from "./app.js";

// Not in ports.md, and away from the old backend's 7000. Day 4 moves this
// into config/env.ts; until then nothing reads process.env.
const PORT = 7100;

const server = createApp().listen(PORT);

// Top-level await (ESM only). `once` resolves on "listening" and rejects if
// "error" fires first, so a taken port (EADDRINUSE) crashes the process with
// the real error instead of leaving it running without a server.
await once(server, "listening");
console.log(`api listening on http://localhost:${PORT}`);
