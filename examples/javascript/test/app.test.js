import { customId } from "@nectar-js/nectar";
import { createTestApp } from "@nectar-js/nectar/testing";
import { describe, expect, test } from "vitest";

// Written by `nectar build`.
const app = createTestApp(new URL("../.nectar/manifest.json", import.meta.url));

describe("commands", () => {
  test("ping replies with the time since the middleware ran and a counter button", async () => {
    const { responses } = await app.command("ping");
    expect(responses).toMatchObject([
      {
        method: "reply",
        options: {
          content: expect.stringMatching(/^Pong in \d+ms$/),
          components: [
            { components: [{ data: { custom_id: customId("counter/[count]", { count: "0" }) } }] },
          ],
        },
      },
    ]);
  });

  test("roll reads its option and defaults to six sides", async () => {
    const twenty = await app.command("roll", { sides: 20 });
    expect(twenty.responses[0]?.options).toMatch(/^You rolled ([1-9]|1\d|20) on a d20\.$/);

    const six = await app.command("roll");
    expect(six.responses[0]?.options).toMatch(/on a d6\.$/);
  });
});

describe("components", () => {
  test("the counter button counts up", async () => {
    const { responses } = await app.button("counter/[count]", { count: "4" });
    expect(responses).toMatchObject([
      {
        method: "update",
        options: {
          components: [
            {
              components: [
                {
                  data: {
                    custom_id: customId("counter/[count]", { count: "5" }),
                    label: "Clicked 5 times",
                  },
                },
              ],
            },
          ],
        },
      },
    ]);
  });
});
