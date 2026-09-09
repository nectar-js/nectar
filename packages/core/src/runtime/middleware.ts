import type {
  ContextExtension,
  Extended,
  Handler,
  InteractionContext,
  Middleware,
  Next,
} from "./types.js";

/**
 * Runs middleware outer to inner, then the handler.
 *
 * `next()` continues unchanged; `next({ member })` puts `member` on every downstream context.
 * Returning without calling `next` stops the chain. Throwing anywhere unwinds to the caller,
 * which hands it to the error boundaries. Code after `await next()` runs after the handler.
 */
export async function runChain(
  middleware: readonly Middleware[],
  ctx: InteractionContext,
  handler: Handler,
): Promise<void> {
  await step(0);

  async function step(index: number, current: InteractionContext = ctx): Promise<unknown> {
    const layer = middleware[index];
    if (layer === undefined) return handler(current);

    let called = false;
    const next: Next = <E extends ContextExtension>(extension?: E) => {
      if (called) throw new Error("next() was called twice in the same middleware.");
      called = true;
      const downstream = extension === undefined ? current : { ...current, ...extension };
      return step(index + 1, downstream) as Promise<Extended<E>>;
    };
    return layer(current, next);
  }
}
