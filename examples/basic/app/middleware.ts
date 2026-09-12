import { defineMiddleware } from "@nectar-js/nectar";

// Runs before every interaction. Handlers read what it returns with use(timing).
export default defineMiddleware(async () => ({ startedAt: Date.now() }));
