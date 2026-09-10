import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Nectar",
  description: "A filesystem-based meta-framework for discord.js.",
  head: [["link", { rel: "icon", type: "image/png", href: "/logo.png" }]],
  themeConfig: {
    logo: "/logo.png",
    nav: [{ text: "Guides", link: "/guides/deployment" }],
    sidebar: [
      { text: "Introduction", link: "/introduction" },
      {
        text: "Guides",
        items: [{ text: "Deploying", link: "/guides/deployment" }],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/nectar-js/nectar" }],
    search: { provider: "local" },
  },
});
