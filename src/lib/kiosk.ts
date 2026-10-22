// Kiosk hardening for an iPad passed around by kids. Import once for its side effects:
//   import "./lib/kiosk";
// CSS in src/ui/global.css does the rest (touch-action, no selection, no callouts).

declare global {
  interface Window {
    __wtpKiosk?: boolean;
  }
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

if (typeof window !== "undefined" && !window.__wtpKiosk) {
  window.__wtpKiosk = true;
  const block = (e: Event) => e.preventDefault();
  const opts: AddEventListenerOptions = { passive: false };

  // Safari pinch zoom ignores user-scalable=no; these proprietary events are the only way to stop it.
  document.addEventListener("gesturestart", block, opts);
  document.addEventListener("gesturechange", block, opts);
  document.addEventListener("gestureend", block, opts);

  // Two-finger drags (pinch) anywhere.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    opts,
  );

  // Trackpad pinch and Ctrl+wheel zoom on the projector laptop.
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    opts,
  );

  // Long-press menus ("Save Image", "Copy") would leak the answer art.
  document.addEventListener("contextmenu", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  document.addEventListener("dragstart", block);
  document.addEventListener("selectstart", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });

  // An empty touchstart listener makes iOS apply :active styles, so buttons visibly press.
  document.addEventListener("touchstart", () => {}, { passive: true });
}

export {};
