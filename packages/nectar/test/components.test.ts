import { describe, expect, test } from "vitest";
import { buildRouteTable } from "../src/compiler/index.js";
import {
  type ComponentRoute,
  compileComponents,
  createMatcher,
  customIdFor,
} from "../src/components/index.js";
import { makeApp } from "./helpers.js";

const handler = "export default async function () {}\n";
const select = (kind: string) => `export const kind = ${kind};\n${handler}`;

async function compile(files: Record<string, string>) {
  const root = makeApp(files);
  const table = buildRouteTable(root);
  expect(table.diagnostics.items).toEqual([]);
  const result = await compileComponents(table);
  return {
    routes: result.routes,
    byId: Object.fromEntries(result.routes.map((r) => [r.id, r])),
    codes: result.diagnostics.items.map((d) => d.code),
    diagnostics: result.diagnostics.items,
  };
}

describe("component routes", () => {
  test("buttons, selects, and modals under one path", async () => {
    const { routes, codes } = await compile({
      "components/confirm/button.ts": handler,
      "components/confirm/select.ts": select('"string"'),
      "components/confirm/modal.ts": handler,
    });
    expect(codes).toEqual([]);
    expect(routes.map((r) => [r.kind, r.selectKind, r.overhead])).toEqual([
      ["button", null, 8],
      ["modal", null, 8],
      ["select", "string", 8],
    ]);
  });

  test("params and overhead", async () => {
    const { byId, codes } = await compile({
      "components/tickets/[ticketId]/close/button.ts": handler,
      "components/tickets/[ticketId]/[action]/select.ts": select('"user"'),
    });
    expect(codes).toEqual([]);
    const close = byId["component:tickets/[ticketId]/close"] as ComponentRoute;
    expect(close.params).toEqual(["ticketId"]);
    expect(close.catchAll).toBeNull();
    expect(close.overhead).toBe(9);
    expect(byId["component:tickets/[ticketId]/[action]"]?.overhead).toBe(10);
  });

  test("catch-all is allowed with a warning", async () => {
    const { byId, diagnostics } = await compile({
      "components/wizard/[...steps]/button.ts": handler,
    });
    expect(byId["component:wizard/[...steps]"]?.catchAll).toBe("steps");
    expect(diagnostics).toMatchObject([{ code: "catch-all-route", severity: "warning" }]);
  });

  test("select.ts without kind", async () => {
    const { codes } = await compile({ "components/pick/select.ts": handler });
    expect(codes).toEqual(["missing-select-kind"]);
  });

  test("select.ts with an unknown kind", async () => {
    const { codes, diagnostics } = await compile({
      "components/pick/select.ts": select('"emoji"'),
    });
    expect(codes).toEqual(["invalid-select-kind"]);
    expect(diagnostics[0]?.message).toContain('"emoji"');
  });

  test("select.ts that fails to import", async () => {
    const { codes } = await compile({
      "components/pick/select.ts": 'import "./missing.js";\nexport const kind = "user";\n',
    });
    expect(codes).toEqual(["module-load-failed"]);
  });

  test("routes that differ only in parameter names conflict", async () => {
    const { codes, diagnostics } = await compile({
      "components/tickets/[id]/close/button.ts": handler,
      "components/tickets/[ticketId]/close/button.ts": handler,
    });
    expect(codes).toEqual(["duplicate-component-pattern"]);
    expect(diagnostics[0]?.route).toBe("component:tickets/[ticketId]/close");
  });

  test("same shape with different kinds does not conflict", async () => {
    const { codes } = await compile({
      "components/tickets/[id]/button.ts": handler,
      "components/tickets/[ticketId]/modal.ts": handler,
    });
    expect(codes).toEqual([]);
  });

  test("static and dynamic siblings are distinct routes", async () => {
    const { routes, codes } = await compile({
      "components/tickets/open/button.ts": handler,
      "components/tickets/[id]/button.ts": handler,
    });
    expect(codes).toEqual([]);
    expect(new Set(routes.map((r) => r.shortId)).size).toBe(2);
  });

  test("short ID collisions are reported", async () => {
    // "component:cqtu" and "component:c132l" both hash to 2p2tg1.
    const { routes, codes, diagnostics } = await compile({
      "components/cqtu/button.ts": handler,
      "components/c132l/button.ts": handler,
    });
    expect(new Set(routes.map((r) => r.shortId))).toEqual(new Set(["2p2tg1"]));
    expect(codes).toEqual(["short-id-collision"]);
    expect(diagnostics[0]?.message).toContain("2p2tg1");
  });
});

describe("customIdFor", () => {
  const route = (
    path: string,
    params: string[],
    catchAll: string | null = null,
  ): ComponentRoute => ({
    id: `component:${path}`,
    shortId: "abcdef",
    category: "component",
    kind: "button",
    path,
    segments: [],
    params,
    file: "",
    selectKind: null,
    catchAll,
    overhead: 8 + params.length,
  });

  test("positional params in route order", () => {
    expect(customIdFor(route("p/[page]/[dir]", ["page", "dir"]), { dir: "next", page: "3" })).toBe(
      "n:abcdef:3:next",
    );
  });

  test("catch-all takes an array or a single value", () => {
    const r = route("w/[id]/[...rest]", ["id", "rest"], "rest");
    expect(customIdFor(r, { id: "1", rest: ["a", "b"] })).toBe("n:abcdef:1:a:b");
    expect(customIdFor(r, { id: "1", rest: "a" })).toBe("n:abcdef:1:a");
    expect(customIdFor(r, { id: "1" })).toBe("n:abcdef:1");
  });

  test("missing or non-string params throw", () => {
    const r = route("p/[page]", ["page"]);
    expect(() => customIdFor(r, {})).toThrow(/parameter "page"/);
    expect(() => customIdFor(r, { page: ["1"] })).toThrow(/got object/);
  });
});

describe("matcher", () => {
  async function build() {
    const { routes } = await compile({
      "components/confirm/button.ts": handler,
      "components/confirm/modal.ts": handler,
      "components/tickets/[ticketId]/close/button.ts": handler,
      "components/wizard/[id]/[...steps]/button.ts": handler,
    });
    const byId = Object.fromEntries(routes.map((r) => [r.path, r])) as Record<
      string,
      ComponentRoute
    >;
    return { byId, matcher: createMatcher(routes) };
  }

  test("resolves routes and params", async () => {
    const { byId, matcher } = await build();
    const close = byId["tickets/[ticketId]/close"] as ComponentRoute;
    const result = matcher.match("button", customIdFor(close, { ticketId: "t:1" }));
    expect(result).toEqual({ ok: true, route: close, params: { ticketId: "t:1" } });
  });

  test("catch-all collects the remaining values", async () => {
    const { byId, matcher } = await build();
    const wizard = byId["wizard/[id]/[...steps]"] as ComponentRoute;
    expect(matcher.match("button", customIdFor(wizard, { id: "1", steps: ["a", "b"] }))).toEqual({
      ok: true,
      route: wizard,
      params: { id: "1", steps: ["a", "b"] },
    });
    expect(matcher.match("button", customIdFor(wizard, { id: "1" }))).toMatchObject({
      params: { id: "1", steps: [] },
    });
  });

  test("kind is part of the key", async () => {
    const { byId, matcher } = await build();
    const id = customIdFor(byId.confirm as ComponentRoute);
    expect(matcher.match("button", id)).toMatchObject({ ok: true, route: { kind: "button" } });
    expect(matcher.match("modal", id)).toMatchObject({ ok: true, route: { kind: "modal" } });
    expect(matcher.match("select", id)).toEqual({ ok: false, reason: "unknown-route" });
  });

  test("rejects wrong parameter counts", async () => {
    const { byId, matcher } = await build();
    const close = byId["tickets/[ticketId]/close"] as ComponentRoute;
    expect(matcher.match("button", `n:${close.shortId}`)).toEqual({
      ok: false,
      reason: "param-count",
    });
    expect(matcher.match("button", `n:${close.shortId}:1:2`)).toEqual({
      ok: false,
      reason: "param-count",
    });
  });

  test("passes through foreign IDs and reports malformed ones", async () => {
    const { matcher } = await build();
    expect(matcher.match("button", "my-own-button")).toEqual({ ok: false, reason: "not-nectar" });
    expect(matcher.match("button", "n:zz")).toEqual({ ok: false, reason: "malformed" });
    expect(matcher.match("button", "n:000000")).toEqual({ ok: false, reason: "unknown-route" });
  });
});

describe("param validators", () => {
  const withParams = (params: string) =>
    `const handler = async () => {};\nhandler.params = ${params};\nexport default handler;\n`;

  test("valid validators compile", async () => {
    const { codes } = await compile({
      "components/tickets/[id]/button.ts": withParams("{ id: (v) => /^d+$/.test(v) }"),
    });
    expect(codes).toEqual([]);
  });

  test("validators for unknown parameters or of the wrong type are errors", async () => {
    const { codes, diagnostics } = await compile({
      "components/tickets/[id]/button.ts": withParams("{ id: 'digits' }"),
      "components/confirm/button.ts": withParams("{ id: () => true }"),
    });
    expect(codes).toEqual(["invalid-param-validator", "invalid-param-validator"]);
    expect(diagnostics[0]?.message).toContain('"id", which is not a parameter');
    expect(diagnostics[0]?.message).toContain("It has none.");
    expect(diagnostics[1]?.message).toContain("`params.id` must be a function");
  });
});
