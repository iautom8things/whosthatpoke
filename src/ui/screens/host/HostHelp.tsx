import type { CSSProperties, ReactNode } from "react";
import { artUrl, monByDex } from "../../../data/catalog";
import { Button, IconCheck, IconEye, IconPlay, IconX, Modal } from "../../components";
import s from "./HostHelp.module.css";

/** A cartoon pointing hand. White glove fill, outlined like everything else. */
export function HandIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 50" aria-hidden="true" focusable="false">
      <path
        d="M18 27V8a4 4 0 0 1 8 0v14a4 4 0 0 1 8 0v2a4 4 0 0 1 8 0v7c0 9-5 15-13 15h-3c-6 0-9-3-12-8l-5-8a3.5 3.5 0 0 1 6-4l3 3z"
        fill="#fff"
        stroke="var(--outline)"
        strokeWidth="3.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M26 22v6M34 24v5" fill="none" stroke="var(--outline)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const DEMO_DEX = 25;

function demoArt(): string | null {
  try {
    return artUrl(monByDex(DEMO_DEX));
  } catch {
    return null;
  }
}

type TileKind = "right" | "left" | "tap";

function Tile({ kind, icon, label, sub }: { kind: TileKind; icon: ReactNode; label: string; sub: string }) {
  const art = demoArt();
  return (
    <div className={s.tile} data-kind={kind}>
      <div className={s.demo}>
        <div className={s.mini}>
          {art && (
            <>
              <img className={s.sil} src={art} alt="" draggable={false} />
              <img className={s.col} src={art} alt="" draggable={false} />
            </>
          )}
          <span className={s.badge}>{icon}</span>
        </div>
        <HandIcon className={s.hand} />
        {kind === "tap" && <span className={s.ripple} />}
      </div>
      <div className={s.label}>
        <span className={s.labelIcon}>{icon}</span>
        <span className="wtp-display wtp-surface-title">{label}</span>
      </div>
      <div className={s.sub}>{sub}</div>
    </div>
  );
}

export interface HostHelpProps {
  open: boolean;
  onClose: () => void;
}

/** First-run help: how the grown-up judges with swipes, with looping hand animations. */
export function HostHelp({ open, onClose }: HostHelpProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shout it out!"
      className={s.panel}
      actions={
        <Button size="lg" icon={<IconPlay />} onPress={onClose} data-autofocus>
          Let’s play!
        </Button>
      }
    >
      <p className={s.lead}>Kids shout the name first. Then you swipe the card.</p>
      <div className={s.tiles}>
        <Tile kind="right" icon={<IconCheck />} label="Swipe right" sub="They got it!" />
        <Tile kind="left" icon={<IconX />} label="Swipe left" sub="Missed it" />
        <Tile kind="tap" icon={<IconEye />} label="Tap" sub="Reveal it to everyone" />
      </div>
      <p className={s.undo}>Wrong call? Tap the other side before the next card.</p>
      <p className={s.keys}>
        Keyboard: <kbd>→</kbd> got it <kbd>←</kbd> missed <kbd>Space</kbd> reveal
      </p>
    </Modal>
  );
}
