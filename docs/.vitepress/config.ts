import { defineConfig } from "vitepress";
import { version } from "../../packages/nectar/package.json";

// GitHub Pages serves the site from https://nectar-js.github.io/nectar/.
const base = "/nectar/";

export default defineConfig({
  base,
  title: "Nectar",
  description: "A filesystem-based meta-framework for discord.js.",
  head: [["link", { rel: "icon", type: "image/png", href: `${base}logo.png` }]],
  markdown: {
    theme: { light: "kanagawa-lotus", dark: "kanagawa-dragon" },
  },
  themeConfig: {
    logo: "/logo.png",
    nav: [
      {
        text: "Docs",
        link: "/introduction",
        activeMatch: "^/(introduction|getting-started/|guides/|migrating/)",
      },
      { text: "Packages", link: "/packages/", activeMatch: "^/packages/" },
      { text: "Reference", link: "/reference/files", activeMatch: "^/reference/" },
      {
        text: `v${version}`,
        link: "https://github.com/nectar-js/nectar/blob/main/packages/nectar/CHANGELOG.md",
      },
    ],
    sidebar: {
      "/packages/": [
        {
          text: "Packages",
          items: [
            { text: "Overview", link: "/packages/" },
            { text: "Project creator", link: "/packages/create" },
          ],
        },
        {
          text: "@nectar-js/i18n",
          items: [
            { text: "Installation", link: "/packages/i18n/" },
            { text: "Translate messages", link: "/packages/i18n/messages" },
            { text: "Translate commands", link: "/packages/i18n/commands" },
            { text: "Configuration and testing", link: "/packages/i18n/reference" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          collapsed: false,
          items: [
            { text: "Reserved files", link: "/reference/files" },
            { text: "Handler context", link: "/reference/handler-context" },
            { text: "Configuration", link: "/reference/config" },
            { text: "CLI", link: "/reference/cli" },
            { text: "Build output", link: "/reference/build-output" },
            { text: "Plugin API", link: "/reference/plugins" },
            { text: "Diagnostics", link: "/reference/diagnostics" },
            { text: "Compatibility", link: "/reference/compatibility" },
          ],
        },
      ],
      "/": [
        {
          text: "Get started",
          items: [
            { text: "Introduction", link: "/introduction" },
            { text: "Installation", link: "/getting-started/installation" },
            { text: "Project structure", link: "/guides/project-structure" },
          ],
        },
        {
          text: "Build your bot",
          items: [
            { text: "Commands", link: "/guides/commands" },
            { text: "Components", link: "/guides/components" },
            { text: "Custom IDs", link: "/guides/custom-ids" },
            { text: "Events", link: "/guides/events" },
            { text: "Middleware", link: "/guides/middleware" },
            { text: "Error handling", link: "/guides/errors" },
            { text: "Localization", link: "/guides/localization" },
          ],
        },
        {
          text: "Run your bot",
          items: [
            { text: "Local development", link: "/guides/development" },
            { text: "Command registration", link: "/guides/command-registration" },
            { text: "Testing", link: "/guides/testing" },
            { text: "Scheduled jobs", link: "/guides/jobs" },
            { text: "Sharding", link: "/guides/sharding" },
            { text: "Deployment", link: "/guides/deployment" },
          ],
        },
        {
          text: "Migration",
          collapsed: true,
          items: [
            { text: "From discord.js", link: "/migrating/discord-js" },
            { text: "From Sapphire", link: "/migrating/sapphire" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/nectar-js/nectar" }],
    search: { provider: "local" },
    notFound: {
      title: "Page not found",
      quote: "It may have moved. Try the search at the top of the page.",
      linkText: "Go to the home page",
      linkLabel: "Go to the home page",
    },
  },
});
