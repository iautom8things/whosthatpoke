import "./dev/sandbox";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/luckiest-guy/400.css";
import "@fontsource-variable/fredoka/index.css";
import "./ui/global.css";
import "./lib/kiosk";
import "./pwa";
import App from "./App";
import { runDemoFromUrl } from "./dev/demos";
import { useSettings } from "./state/settings";

// ?lab=gallery shows the design-system gallery, ?lab=audio the sound lab. Dev and QA only.
const LABS = {
  gallery: lazy(() => import("./dev/Gallery")),
  audio: lazy(() => import("./dev/AudioLab")),
};
const params = new URLSearchParams(location.search);
const lab = params.get("lab") as keyof typeof LABS | null;
const Lab = lab ? LABS[lab] : null;

// QA overrides: ?theme=classic&projector=on&motion=reduce
const theme = params.get("theme");
if (theme === "spooky" || theme === "classic") useSettings.getState().update({ theme });
if (params.has("projector")) useSettings.getState().update({ projector: params.get("projector") === "on" });
if (params.get("motion") === "reduce") useSettings.getState().update({ reduceMotion: true });

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
