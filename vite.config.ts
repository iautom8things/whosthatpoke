import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The recorded announcer (scripts/voice writes it). Without it the game asks for no index, so a voiceless build
// logs no 404, and every line uses the device voice. Checked at build and at dev server start.
const hasVoice = existsSync(fileURLToPath(new URL("./public/voice/index.json", import.meta.url)));

// Relative base so the build works from GitHub Pages, a subfolder, or `vite preview`.
export default defineConfig({
  base: "./",
  define: { __VOICE_INDEX__: JSON.stringify(hasVoice) },
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
        // Only the app itself, the voice index and the few lines every game says ("Who's that Pokémon?",
        // "Game over!"). Pictures (~29 MB) and the other clips (~90 MB) come per round through the routes below,
        // or all at once from Settings > Offline (src/pwa.ts), so a guest's phone on cellular never pulls the
        // whole game. The plugin adds manifest.webmanifest itself. 3 MB catches a runaway asset.
        globPatterns: ["**/*.{js,css,html,woff2}", "icons/*.png", "favicon.svg", "voice/index.json", "voice/line.*.mp3"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Older versions precached every picture, and activating this one deletes them from the precache.
        // public/sw-keep-art.js copies them to the art cache first, so a device that saved them keeps them.
        importScripts: ["sw-keep-art.js"],
        // Every picture and clip a round fetches stays for good, so anything played once plays offline.
        // Only 200 (or 0, opaque) is stored, so a 206 from a range request never is; and nothing asks for ranges,
        // since clips are fetched whole and decoded with Web Audio. Requests with an x-wtp-save header are Save
        // for offline, which writes these caches from the page (src/pwa-save.ts), so they skip the worker.
        runtimeCaching: [
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              sameOrigin && !request.headers.has("x-wtp-save") && /\/pokemon\/\d+\.svg$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "wtp-art", cacheableResponse: { statuses: [0, 200] }, matchOptions: { ignoreVary: true } },
          },
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              sameOrigin && !request.headers.has("x-wtp-save") && /\/voice\/[^/]+\.mp3$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "wtp-voice", cacheableResponse: { statuses: [0, 200] }, matchOptions: { ignoreVary: true } },
          },
        ],
        cleanupOutdatedCaches: true,
        // Take over the tab that did the first install. Without it that tab never reads the caches, so a
        // host who waits for "Ready" and then goes offline sees only "?".
        // Updates still wait for SKIP_WAITING ("prompt" above).
        clientsClaim: true,
        navigateFallback: "index.html",
        // Only the app root (here or one folder down, like /whosthatpoke/ on Pages). Deeper paths
        // would get index.html with ./assets resolving under the wrong folder: a blank page.
        navigateFallbackAllowlist: [/^\/(?:[^/]+\/)?(?:index\.html)?(?:\?.*)?$/],
      },
    }),
  ],
  server: { host: true },
});
