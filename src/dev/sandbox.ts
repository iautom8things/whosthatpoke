// QA URLs (?demo=, ?lab=) run on this tab's sessionStorage, so demo scores and overridden
// settings never reach the party iPad's real localStorage. ?projector=on or ?theme= on their own
// are real shortcuts and save like the Settings switches do (see main.tsx).
// Must be imported before anything that touches storage.
const QA_PARAMS = ["demo", "lab"];

const params = new URLSearchParams(location.search);
if (QA_PARAMS.some((p) => params.has(p))) {
  try {
    Object.defineProperty(window, "localStorage", { value: window.sessionStorage, configurable: true });
  } catch {
    // Some browsers refuse; the QA overrides still work, they just persist.
  }
}
