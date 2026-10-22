// QA URLs (?demo=, ?theme=, ?projector=, ?motion=) run on this tab's sessionStorage, so demo
// scores and overridden settings never reach the party iPad's real localStorage.
// Must be imported before anything that touches storage.
const QA_PARAMS = ["demo", "theme", "projector", "motion"];

const params = new URLSearchParams(location.search);
if (QA_PARAMS.some((p) => params.has(p))) {
  try {
    Object.defineProperty(window, "localStorage", { value: window.sessionStorage, configurable: true });
  } catch {
    // Some browsers refuse; the QA overrides still work, they just persist.
  }
}
