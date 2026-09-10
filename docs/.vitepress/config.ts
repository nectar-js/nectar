import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Nectar",
  description: "A filesystem-based meta-framework for discord.js.",
  head: [["link", { rel: "icon", type: "image/png", href: "/logo.png" }]],
  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "Concepts", link: "/concepts/app-directory" },
      { text: "Guides", link: "/guides/deployment" },
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
        items: [{ text: "Deploying", link: "/guides/deployment" }],
      },
      {
        text: "Reference",
        items: [{ text: "Reserved files", link: "/reference/files" }],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/nectar-js/nectar" }],
    search: { provider: "local" },
  },
});
