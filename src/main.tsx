import "./dev/sandbox";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/luckiest-guy/400.css";
import "@fontsource-variable/fredoka/index.css";
import "./ui/global.css";
import "./lib/kiosk";
import { isInstalled } from "./pwa";
import App from "./App";
import { runDemoFromUrl } from "./dev/demos";
import { reloadForMissingChunk } from "./lib/staleChunk";
import { fault, startGameMetrics } from "./metrics";
import { hasStoredSettings, useSettings } from "./state/settings";

// A chunk that fails to load (an old tab after an update) reloads the page once instead of crashing.
window.addEventListener("vite:preloadError", (e) => {
  fault("chunk", e.payload);
  try {
    reloadForMissingChunk({ storage: sessionStorage, now: Date.now(), online: navigator.onLine, reload: () => location.reload() });
  } catch {
    // No sessionStorage means no loop guard, so the Oops card stays.
  }
});

// ?lab=gallery shows the design-system gallery, ?lab=audio the sound lab, ?lab=sign the printable play-at-home sign.
const LABS = {
  gallery: lazy(() => import("./dev/Gallery")),
  audio: lazy(() => import("./dev/AudioLab")),
  sign: lazy(() => import("./dev/Sign")),
};
const params = new URLSearchParams(location.search);
const lab = params.get("lab") as keyof typeof LABS | null;
const Lab = lab ? LABS[lab] : null;

// A laptop driving a 720p or 768p projector: no touch, 1x pixels, short and wide. Only on a first
// visit, so the host's own choice always wins, and never in demos, so QA shots stay comparable.
// A mirrored iPad can't be told apart; the host flips Projector mode there.
const looksLikeProjector = () =>
  !window.matchMedia?.("(pointer: coarse)").matches &&
  window.devicePixelRatio === 1 &&
  window.innerHeight <= 800 &&
  window.innerWidth / window.innerHeight >= 1.5;
const autoDetect = !params.has("demo") && !lab && !params.has("projector") && !hasStoredSettings();
if (autoDetect && looksLikeProjector()) useSettings.getState().update({ projector: true });

// ?theme=classic&projector=on&motion=reduce. With ?demo= or ?lab= they stay in the tab's sandbox
// (dev/sandbox.ts); on their own they save, so ?projector=on works as a big-screen bookmark.
const theme = params.get("theme");
if (theme === "spooky" || theme === "classic") useSettings.getState().update({ theme });
if (params.has("projector")) useSettings.getState().update({ projector: params.get("projector") === "on" });
if (params.get("motion") === "reduce") useSettings.getState().update({ reduceMotion: true });

// Anonymous play counts, only on the real site (src/metrics.ts). After the settings above, so app_open sees them.
startGameMetrics(isInstalled);

runDemoFromUrl().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {Lab ? (
        <Suspense fallback={null}>
          <Lab />
        </Suspense>
      ) : (
        <App />
      )}
    </StrictMode>,
  );
});
