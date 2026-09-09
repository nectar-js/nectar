import { pathToFileURL } from "node:url";

/**
 * Imports an application module by absolute path.
 *
 * Relies on Node's native TypeScript type stripping (unflagged since 22.18), so handler
 * files must use erasable syntax only: no enums, namespaces, or parameter properties.
 */
export async function loadModule(file: string): Promise<Record<string, unknown>> {
  const url = pathToFileURL(file).href;
  return (await import(url)) as Record<string, unknown>;
}
