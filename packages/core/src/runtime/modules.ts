import { loadModule } from "../compiler/load.js";

export type HandlerModule = Record<string, unknown>;

export class HandlerLoadError extends Error {
  constructor(
    readonly file: string,
    detail: string,
  ) {
    super(`${file}: ${detail}`);
    this.name = "HandlerLoadError";
  }
}

/**
 * Imports handler modules once and caches them. Files are absolute paths taken from the
 * manifest, so nothing here touches the filesystem beyond `import()`.
 */
export class ModuleRegistry {
  private readonly cache = new Map<string, Promise<HandlerModule>>();

  load(file: string): Promise<HandlerModule> {
    let pending = this.cache.get(file);
    if (pending === undefined) {
      pending = loadModule(file).catch((error: unknown) => {
        this.cache.delete(file);
        throw new HandlerLoadError(file, error instanceof Error ? error.message : String(error));
      });
      this.cache.set(file, pending);
    }
    return pending;
  }

  /** Imports every file up front so a bad module fails startup instead of the first interaction. */
  async preload(files: Iterable<string>): Promise<void> {
    await Promise.all([...new Set(files)].map((file) => this.load(file)));
  }

  /** The default export of a file, checked to be a function. */
  async loadDefault<T>(file: string, what: string): Promise<T> {
    const module = await this.load(file);
    const value = module.default;
    if (typeof value !== "function") {
      throw new HandlerLoadError(
        file,
        `${what} must be the default export and a function, got ${describe(value)}.`,
      );
    }
    return value as T;
  }

  /** A named export of a file, checked to be a function. */
  async loadNamed<T>(file: string, name: string, what: string): Promise<T> {
    const module = await this.load(file);
    const value = module[name];
    if (typeof value !== "function") {
      throw new HandlerLoadError(
        file,
        `${what} must be exported as "${name}" and be a function, got ${describe(value)}.`,
      );
    }
    return value as T;
  }
}

function describe(value: unknown): string {
  return value === undefined ? "no export" : typeof value;
}
