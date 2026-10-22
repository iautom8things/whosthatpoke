import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the build works from GitHub Pages, a subfolder, or `vite preview`.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new version waits instead of reloading mid-game. src/pwa.ts applies it on the
      // splash screen or from Settings.
      registerType: "prompt",
      injectRegister: false,
      // The glob below already precaches the icons.
      includeManifestIcons: false,
      manifest: {
        id: "./",
        name: "Who's That Pokémon?",
        short_name: "Who's That?",
        description: "A silhouette guessing game for trunk-or-treat night.",
        lang: "en",
        start_url: ".",
        scope: ".",
        display: "fullscreen",
        orientation: "any",
        background_color: "#0a0420",
        theme_color: "#0a0420",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Everything, art included, so the van needs no network. ~1000 SVGs is ~40 MB; the biggest
        // single file is ~0.6 MB, so 3 MB catches a runaway asset without dropping real ones.
        // The plugin adds manifest.webmanifest itself.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2,json}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },
    }),
  ],
  server: { host: true },
});
