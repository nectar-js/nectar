import type { Interaction } from "discord.js";
import { type Middleware, stop } from "./types.js";

/**
 * Runs the chain outer to inner with the interaction. Each result is kept for `use()`.
 * Resolves to `false` when a middleware returned `stop`, so the handler must not run.
 * Throwing anywhere unwinds to the caller, which hands it to the error boundaries.
 */
export async function runMiddleware(
  middleware: readonly Middleware[],
  interaction: Interaction,
  results: Map<Middleware, unknown>,
  onEnter?: (index: number) => void,
): Promise<boolean> {
  for (const [index, layer] of middleware.entries()) {
    onEnter?.(index);
    const result = await layer(interaction);
    if (result === stop) return false;
    results.set(layer, result);
  }
  return true;
}
