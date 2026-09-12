import { readFileSync } from "node:fs";
import { useLocales } from "@nectar-js/i18n/testing";
import { createTestApp } from "@nectar-js/nectar/testing";
import { describe, expect, test } from "vitest";

// Tests load the manifest, not nectar.config.ts, so nothing has told the translator where the
// catalogs live.
useLocales(new URL("../locales", import.meta.url));

// Written by `nectar build`.
const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));

const member = { id: "42", toString: () => "<@42>" };

describe("replies", () => {
  test("answers in the reader's locale", async () => {
    const { responses } = await app.command("ping", {}, { locale: "fr" });
    expect(responses).toEqual([
      { method: "reply", options: expect.stringMatching(/^Pong\. Aller-retour en /) },
    ]);
  });

  test("falls back to en-US for a locale with no catalog", async () => {
    const { responses } = await app.command("ping", {}, { locale: "de" });
    expect(responses).toEqual([
      { method: "reply", options: expect.stringMatching(/^Pong\. Round trip took /) },
    ]);
  });

  test("localizes the button label with the rest of the reply", async () => {
    const { responses } = await app.command("ban", { member }, { locale: "fr" });
    expect(responses).toMatchObject([
      {
        method: "reply",
        options: {
          content: "Bannir <@42> ?",
          components: [{ components: [{ data: { label: "Bannir" } }] }],
        },
      },
    ]);
  });
});

describe("plurals", () => {
  test("picks the form for the count, including an exact zero", async () => {
    const first = await app.button("ban/[userId]/confirm", { userId: "7" });
    expect(first.responses).toMatchObject([
      { options: { content: "Banned <@7>.\n<@7> has never been banned here." } },
    ]);

    const second = await app.button("ban/[userId]/confirm", { userId: "7" });
    expect(second.responses).toMatchObject([
      { options: { content: "Banned <@7>.\n<@7> has been banned 1 time before." } },
    ]);
  });
});

describe("command metadata", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../.nectar/manifest.json", import.meta.url), "utf8"),
  ) as { commands: { name: string; payload: Record<string, unknown> }[] };

  test("registers the catalog translations with Discord", () => {
    const ban = manifest.commands.find((command) => command.name === "ban");
    expect(ban?.payload).toMatchObject({
      description: "Ban a member",
      description_localizations: { fr: "Bannir un membre" },
      options: [{ name: "member", name_localizations: { fr: "membre" } }],
    });
  });
});
