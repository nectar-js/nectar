import { readFileSync } from "node:fs";
import path from "node:path";
import { MANIFEST_VERSION, type Manifest } from "./schema.js";

export interface LoadedManifest {
  manifest: Manifest;
  /** Absolute path of the app directory the manifest was compiled from. */
  appDir: string;
}

export class ManifestVersionError extends Error {
  constructor(
    readonly file: string,
    readonly found: unknown,
  ) {
    super(
      `${file} is manifest version ${String(found)}, this build of @neatjs/core reads version ${MANIFEST_VERSION}. Run \`neat build\` again.`,
    );
    this.name = "ManifestVersionError";
  }
}

/** Reads a manifest from disk and checks its version. Does not validate the rest of the shape. */
export function loadManifest(file: string): LoadedManifest {
  const absolute = path.resolve(file);
  const parsed: unknown = JSON.parse(readFileSync(absolute, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${absolute} is not a manifest object.`);
  }
  const manifest = parsed as Partial<Manifest>;
  if (manifest.version !== MANIFEST_VERSION) {
    throw new ManifestVersionError(absolute, manifest.version);
  }
  if (typeof manifest.appDir !== "string") {
    throw new TypeError(`${absolute} has no appDir.`);
  }
  return {
    manifest: manifest as Manifest,
    appDir: path.resolve(path.dirname(absolute), manifest.appDir),
  };
}
