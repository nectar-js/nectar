import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { APIApplicationCommand } from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  type CommandRest,
  REGISTRATION_CACHE_FILE,
  syncCommands,
  UnsafeSyncError,
} from "../src/registration/index.js";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function temp(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nect-sync-"));
  temps.push(dir);
  return dir;
}

/** A fake Discord that stores what it was given and echoes it back with server-side fields. */
function fakeDiscord(initial: Record<string, APIApplicationCommand[]> = {}) {
  const store = new Map(Object.entries(initial));
  const rest = {
    get: vi.fn(async (route: string) => store.get(route) ?? []),
    put: vi.fn(async (route: string, { body }: { body: unknown }) => {
      const stored = (body as Record<string, unknown>[]).map(
        (c, i) =>
          ({
            id: String(i),
            application_id: "app",
            version: "1",
            type: 1,
            nsfw: false,
            contexts: null,
            integration_types: [0],
            default_member_permissions: null,
            ...c,
          }) as unknown as APIApplicationCommand,
      );
      store.set(route, stored);
      return stored;
    }),
  } satisfies CommandRest;
  return { rest, store };
}

const ping = { name: "ping", description: "Pong" };
const help = { name: "help", description: "Help" };
const GLOBAL = "/applications/app/commands";

describe("syncCommands", () => {
  test("writes only scopes with changes and reports the diff", async () => {
    const { rest } = fakeDiscord({ "/applications/app/guilds/g1/commands": [] });
    await rest.put("/applications/app/guilds/g2/commands", { body: [ping] });
    rest.put.mockClear();

    const result = await syncCommands({
      rest,
      applicationId: "app",
      commands: [ping],
      scopes: [{ guild: "g1" }, { guild: "g2" }],
    });

    expect(result.unsafe).toEqual([]);
    expect(result.scopes.map((s) => [s.applied, s.diff?.added, s.diff?.unchanged])).toEqual([
      [true, ["ping"], []],
      [false, [], ["ping"]],
    ]);
    expect(rest.put).toHaveBeenCalledTimes(1);
    expect(rest.put).toHaveBeenCalledWith("/applications/app/guilds/g1/commands", {
      body: [ping],
    });
  });

  test("a second run with the cache makes no REST calls at all", async () => {
    const { rest } = fakeDiscord();
    const cacheDir = temp();
    const base = {
      rest,
      applicationId: "app",
      commands: [ping, help],
      scopes: ["global" as const],
      cacheDir,
    };

    await syncCommands(base);
    expect(rest.get).toHaveBeenCalledTimes(1);
    expect(rest.put).toHaveBeenCalledTimes(1);
    const cache = JSON.parse(readFileSync(path.join(cacheDir, REGISTRATION_CACHE_FILE), "utf8"));
    expect(cache).toMatchObject({ version: 1, applicationId: "app" });
    expect(Object.keys(cache.scopes)).toEqual(["global"]);

    const again = await syncCommands({ ...base, commands: [help, { ...ping, nsfw: false }] });
    expect(again.scopes).toEqual([{ scope: "global", diff: null, applied: false }]);
    expect(rest.get).toHaveBeenCalledTimes(1);
    expect(rest.put).toHaveBeenCalledTimes(1);

    await syncCommands({ ...base, commands: [ping] });
    expect(rest.get).toHaveBeenCalledTimes(2);
    expect(rest.put).toHaveBeenCalledTimes(2);
  });

  test("without a cache an unchanged app reads but does not write", async () => {
    const { rest } = fakeDiscord();
    const base = { rest, applicationId: "app", commands: [ping], scopes: ["global" as const] };
    await syncCommands(base);
    const again = await syncCommands(base);
    expect(again.scopes[0]?.applied).toBe(false);
    expect(rest.get).toHaveBeenCalledTimes(2);
    expect(rest.put).toHaveBeenCalledTimes(1);
  });

  test("refuses to remove every command unless forced", async () => {
    const { rest, store } = fakeDiscord();
    await rest.put(GLOBAL, { body: [ping] });
    rest.put.mockClear();
    const base = { rest, applicationId: "app", commands: [], scopes: ["global" as const] };

    await expect(syncCommands(base)).rejects.toThrow(UnsafeSyncError);
    await expect(syncCommands(base)).rejects.toThrow(/declares none/);
    expect(rest.put).not.toHaveBeenCalled();

    const dry = await syncCommands({ ...base, dryRun: true });
    expect(dry.unsafe).toHaveLength(1);
    expect(dry.scopes[0]?.diff?.removed).toEqual(["ping"]);
    expect(rest.put).not.toHaveBeenCalled();

    await syncCommands({ ...base, force: true });
    expect(store.get(GLOBAL)).toEqual([]);
  });

  test("refuses when the application ID or scope set changed since the last sync", async () => {
    const { rest } = fakeDiscord();
    const cacheDir = temp();
    await syncCommands({
      rest,
      applicationId: "app",
      commands: [ping],
      scopes: [{ guild: "g1" }],
      cacheDir,
    });

    await expect(
      syncCommands({
        rest,
        applicationId: "other",
        commands: [ping],
        scopes: [{ guild: "g1" }],
        cacheDir,
      }),
    ).rejects.toThrow(/application ID changed from app to other/);

    const scopeChange = {
      rest,
      applicationId: "app",
      commands: [ping],
      scopes: ["global" as const],
      cacheDir,
    };
    await expect(syncCommands(scopeChange)).rejects.toThrow(/guild:g1 received commands last time/);
    expect(rest.put).toHaveBeenCalledTimes(1);

    await syncCommands({ ...scopeChange, force: true });
    expect(rest.put).toHaveBeenLastCalledWith(GLOBAL, { body: [ping] });
    const cache = JSON.parse(readFileSync(path.join(cacheDir, REGISTRATION_CACHE_FILE), "utf8"));
    expect(Object.keys(cache.scopes)).toEqual(["global"]);
  });

  test("checks every scope before writing any", async () => {
    const { rest } = fakeDiscord();
    await rest.put("/applications/app/guilds/g2/commands", { body: [ping] });
    rest.put.mockClear();

    await expect(
      syncCommands({
        rest,
        applicationId: "app",
        commands: [],
        scopes: [{ guild: "g1" }, { guild: "g2" }],
      }),
    ).rejects.toThrow(UnsafeSyncError);
    expect(rest.put).not.toHaveBeenCalled();
  });

  test("dry run writes neither Discord nor the cache", async () => {
    const { rest } = fakeDiscord();
    const cacheDir = temp();
    const result = await syncCommands({
      rest,
      applicationId: "app",
      commands: [ping],
      scopes: ["global"],
      cacheDir,
      dryRun: true,
    });
    expect(result.scopes[0]?.diff?.added).toEqual(["ping"]);
    expect(rest.put).not.toHaveBeenCalled();
    expect(() => readFileSync(path.join(cacheDir, REGISTRATION_CACHE_FILE))).toThrow();
  });
});
