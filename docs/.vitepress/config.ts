import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Nectar",
  description: "A filesystem-based meta-framework for discord.js.",
  head: [["link", { rel: "icon", type: "image/png", href: "/logo.png" }]],
  markdown: {
    theme: { light: "kanagawa-lotus", dark: "kanagawa-dragon" },
  },
  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "Concepts", link: "/concepts/app-directory" },
      { text: "Guides", link: "/guides/components" },
      { text: "Reference", link: "/reference/files" },
    ],
    sidebar: [
      { text: "Introduction", link: "/introduction" },
      {
        text: "Concepts",
        items: [
          { text: "The app directory", link: "/concepts/app-directory" },
          { text: "Compilation", link: "/concepts/compilation" },
          { text: "Interactions", link: "/concepts/interactions" },
          { text: "Custom IDs", link: "/concepts/custom-ids" },
          { text: "Middleware and errors", link: "/concepts/middleware-and-errors" },
          { text: "What Nectar owns", link: "/concepts/ownership" },
          { text: "Command registration", link: "/concepts/registration" },
          { text: "Development and production", link: "/concepts/dev-and-production" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Components", link: "/guides/components" },
          { text: "Middleware", link: "/guides/middleware" },
          { text: "Error handling", link: "/guides/errors" },
          { text: "Testing", link: "/guides/testing" },
          { text: "Sharding", link: "/guides/sharding" },
          { text: "Deploying", link: "/guides/deployment" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Reserved files", link: "/reference/files" },
          { text: "Configuration", link: "/reference/config" },
          { text: "Plugins", link: "/reference/plugins" },
          { text: "CLI", link: "/reference/cli" },
          { text: "Compatibility", link: "/reference/compatibility" },
        ],
      },
    ],
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
