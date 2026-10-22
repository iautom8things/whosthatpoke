import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";
import { IconRefresh } from "./icons";
import { Panel } from "./Panel";
import s from "./ErrorBoundary.module.css";

interface State {
  failed: boolean;
}

/**
 * Catches a screen that throws while rendering or whose chunk fails to load, and shows a restart
 * card instead of a blank page. The installed app is full screen with no reload button, so this
 * is the only way out short of force-quitting. App.tsx wraps each screen in one.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Screen crashed", error, info.componentStack);
  }

  render() {
    return this.state.failed ? <CrashCard /> : this.props.children;
  }
}

const restart = () => location.reload();

function CrashCard() {
  return (
    <div className={s.root} onClick={restart} role="alert">
      <Panel tone="solid" padding="lg" className={s.panel}>
        <h1 className={`wtp-display ${s.title}`}>Oops!</h1>
        <p className={s.text}>Something went wrong.</p>
        <Button size="xl" icon={<IconRefresh />} sfx={null} onPress={restart} autoFocus>
          Tap to restart
        </Button>
      </Panel>
    </div>
  );
}
