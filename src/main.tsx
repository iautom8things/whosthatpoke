import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/luckiest-guy/400.css";
import "@fontsource-variable/fredoka/index.css";
import "./ui/global.css";
import App from "./App";
import { runDemoFromUrl } from "./dev/demos";

runDemoFromUrl().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
