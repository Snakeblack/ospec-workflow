// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// This project is a generated Starlight shell (Option D of sdd-document).
// Content under src/content/docs/ is populated exclusively by
// scripts/sync-openwiki.mjs from ../openwiki/ — do not author pages here.
export default defineConfig({
  integrations: [
    starlight({
      title: "Project Documentation",
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
