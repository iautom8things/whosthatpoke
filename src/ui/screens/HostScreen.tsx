// Host mode ("Shout it out!"): a grown-up holds the iPad, the projector mirrors it, kids shout the name.
// Swipe right = got it, left = missed, up or tap = reveal first. Buttons and keys do the same.
// While the answer is up, the other paddle or a swipe the other way changes the verdict.
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { announcer, audio, lines, whosThat, type WhosThat } from "../../audio";
import { haptic } from "../../lib/haptic";
import { useKeys } from "../../lib/useKeys";
import { useSwipe, type SwipeDirection } from "../../lib/useSwipe";
import { useViewport } from "../../lib/useViewport";
import { fault } from "../../metrics";
import { onBrowserBack, useNav } from "../../state/nav";
import { peekNext, useSession } from "../../state/session";
import { useSettings } from "../../state/settings";
import {
  BackButton,
  Button,
  celebrate,
  ConfirmDialog,
  Display,
  IconBack,
  IconButton,
  IconCheck,
  IconEye,
  IconNext,
  IconQuestion,
  IconStar,
  IconX,
  Pill,
  ProgressDots,
  ScreenFrame,
  toast,
} from "../components";
import { fetchAhead, nameAhead } from "./game/prefetch";
import { ART_CHECK_MS, artLoads, dealWithArt } from "./host/artCheck";
import { hostDemo, hostHelpSeen, markHostHelpSeen } from "./host/flags";
import s from "./host/Host.module.css";
import { DeckBacks, HostCard, type CardFace, type Verdict } from "./host/HostCard";
import { HostHelp } from "./host/HostHelp";
import { justDealt, swipeAction } from "./host/hostIntent";

/** How long the answer stays up after judging a silhouette, and after judging a card already peeked at. */
const REVEAL_MS = 2600;
const REVEAL_AFTER_PEEK_MS = 1500;
/** A second press this soon after judging is a double tap, not "next". */
const MIN_REVEAL_MS = 450;
/** The card flies in, then the round starts. */
const INTRO_MS = 420;
/** Exit animation length before leaving for the results. */
const LEAVE_MS = 600;

const CARD: Variants = {
  enter: { opacity: 0, y: "55%", scale: 0.5, rotate: -12 },
  // A short delay lets the thrown card clear the middle before the next one is dealt.
  center: {
    opacity: 1,
    x: "0%",
    y: "0%",
    scale: 1,
    rotate: 0,
    transition: { type: "spring", stiffness: 320, damping: 24, mass: 0.9, delay: 0.12 },
  },
  exit: (dir: number) => ({
    opacity: [1, 1, 0],
    x: `${dir * 130}%`,
    y: "-8%",
    rotate: dir * 30,
    transition: { duration: 0.4, ease: [0.4, 0, 0.9, 0.5] },
  }),
};

/** Remembers a press so a short tap on the card (no drag) can reveal. useSwipe ignores taps on purpose. */
interface Press {
  id: number;
  x: number;
  y: number;
  t: number;
  /** Started on the card, not on a paddle: only those taps reveal or deal. */
  onCard: boolean;
  /** Moved past the slop: the layout holds the pointer, and the click that ends it is swallowed. */
  dragged: boolean;
}
/** A press that moves further is a drag, not a tap: on the card it reveals nothing, on a paddle it presses nothing. */
const TAP_SLOP = 10;
const TAP_MS = 600;

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const isHidden = () => document.visibilityState === "hidden";

const blurIfPointer = (e: MouseEvent<HTMLButtonElement>) => {
  // A mouse or finger press leaves focus on the button; Space would then press it again.
  if (e.detail > 0) e.currentTarget.blur();
};

/** A curved arrow back. The kit has no undo icon. */
function IconUndo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export default function HostScreen() {
  const current = useSession((st) => st.current);
  const phase = useSession((st) => st.phase);
  const config = useSession((st) => st.config);
  const rounds = useSession((st) => st.rounds);
  const correct = useSession((st) => st.correct);
  const streak = useSession((st) => st.streak);
  const autoAdvance = useSettings((st) => st.autoAdvance);
  const vp = useViewport();

  const [peeked, setPeeked] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(() => !hostHelpSeen());
  const [confirmQuit, setConfirmQuit] = useState(false);
  /** Bumped when the verdict changes, so the reveal hold and its fuse start over. */
  const [flips, setFlips] = useState(0);
  /** The card whose art was checked (see the deal effect). Its round starts only then. */
  const [artReady, setArtReady] = useState<number | null>(null);
  const toldArt = useRef(false);
  const hidden = useSyncExternalStore(subscribeVisibility, isHidden);
  const judgedAt = useRef(0);
  const dealtAt = useRef(performance.now());
  /** The card a press started on. A swipe or tap that ends on a newer card is dropped. */
  const pressCard = useRef<number | null>(null);
  const advanceDir = useRef<1 | -1 | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  /** The press turned into a drag: the click that ends it must not also press the paddle it started on. */
  const swallowClick = useRef(false);
  const cue = useRef<WhosThat | null>(null);

  // Arrive with a host game ready. The setup screens normally start it; anything else gets a fresh one.
  useEffect(() => {
    const st = useSession.getState();
    if (st.config?.mode !== "host" || !st.current || st.phase === "idle" || st.phase === "done") {
      st.setSetup({ mode: "host" });
      st.start();
    }
  }, []);

  useEffect(() => {
    audio.playSong("question");
    return () => {
      cue.current?.cancel();
      cue.current = null;
      announcer.cancel();
    };
  }, []);

  const total = config?.rounds ?? useSettings.getState().rounds;
  const index = current?.index ?? rounds.length;
  const last = rounds.at(-1);
  const judged = phase === "revealed";
  const peek = current != null && peeked === current.index;
  const face: CardFace = judged ? "judged" : peek ? "peek" : "hidden";
  const verdict: Verdict | null = judged && last ? (last.correct ? "got" : "missed") : null;
  const missed = rounds.length - correct;
  const exitDir = advanceDir.current ?? (last?.correct === false ? -1 : 1);
  const live = current != null && phase !== "done" && phase !== "idle" && !helpOpen && !confirmQuit;

  // A new deal never shows a "?" tile: art that fails to load (offline, missing file) gets the card swapped for a spare.
  const dealing = phase === "intro" ? index : null;
  useEffect(() => {
    if (dealing == null) return;
    let alive = true;
    void dealWithArt({
      current: () => useSession.getState().current?.answer,
      loads: (mon) => artLoads(mon, ART_CHECK_MS),
      swap: () => alive && useSession.getState().swapCurrent(),
    }).then((ok) => {
      if (!alive) return;
      if (!ok && !toldArt.current) {
        toldArt.current = true;
        toast("Some pictures won’t load. Check the connection.", { tone: "bad", ms: 4000 });
        fault("art", `No picture for #${useSession.getState().current?.answer.dex}`);
      }
      setArtReady(dealing);
    });
    return () => {
      alive = false;
    };
  }, [dealing]);

  // A new card: the sting, "Who's that Pokémon?", then the round is on. A hidden tab waits.
  const dex = current?.answer.dex;
  useEffect(() => {
    if (phase !== "intro" || dex == null || helpOpen || hidden || artReady !== index) return;
    // The line outlives the intro (it starts about 1 s in), so only leaving the screen cancels it.
    const sting = window.setTimeout(() => (cue.current = whosThat()), 120);
    const ask = window.setTimeout(() => useSession.getState().beginAsking(), INTRO_MS);
    return () => {
      window.clearTimeout(sting);
      window.clearTimeout(ask);
    };
  }, [phase, dex, helpOpen, hidden, artReady]);

  useEffect(() => {
    if (!current) return;
    // This card's art and name download first, then the next card's, before it is dealt.
    const upcoming = peekNext();
    void fetchAhead([current, upcoming].flatMap((q) => (q ? [nameAhead(q.answer)] : [])));
    // The name plays the moment the host taps.
    announcer.prepare([lines.reveal(current.answer), upcoming && lines.reveal(upcoming.answer)]);
  }, [current]);

  // After judging: hold the answer up, then deal the next card. A hidden tab holds it until it is back.
  useEffect(() => {
    if (phase !== "revealed" || !autoAdvance || helpOpen || confirmQuit || hidden || hostDemo.holdReveal) return;
    const ms = peeked === index ? REVEAL_AFTER_PEEK_MS : REVEAL_MS;
    const t = window.setTimeout(() => advance(), ms);
    return () => window.clearTimeout(t);
    // advance reads fresh state from the store; the round index (or a changed verdict) restarts the clock.
  }, [phase, index, flips, autoAdvance, helpOpen, confirmQuit, hidden]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = window.setTimeout(() => useNav.getState().go("results", { replace: true }), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  function stageOrigin(): { x: number; y: number } {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return { x: 0.5, y: 0.45 };
    return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height * 0.4) / window.innerHeight };
  }

  const fresh = () => justDealt(dealtAt.current, performance.now());

  /** Says the card's name once "Who's that Pokémon?" is done, so a quick tap never cuts it off. */
  function sayName(index: number, mon: Parameters<typeof lines.reveal>[0]) {
    const ask = cue.current;
    if (!ask) return void announcer.say(lines.reveal(mon));
    void ask.finish().then(() => {
      if (cue.current === ask && useSession.getState().current?.index === index) void announcer.say(lines.reveal(mon));
    });
  }

  function reveal() {
    const st = useSession.getState();
    if (!st.current || (st.phase !== "asking" && st.phase !== "intro") || peeked === st.current.index || fresh()) return;
    setPeeked(st.current.index);
    audio.sfx("reveal");
    haptic("select");
    sayName(st.current.index, st.current.answer);
  }

  function judge(got: boolean) {
    const st = useSession.getState();
    if (!st.current || (st.phase !== "asking" && st.phase !== "intro") || fresh()) return;
    const wasPeeked = peeked === st.current.index;
    const round = st.judge(got);
    if (!round) return;
    judgedAt.current = performance.now();
    advanceDir.current = null;
    audio.sfx(got ? "correct" : "wrong");
    haptic(got ? "success" : "error");
    if (!wasPeeked) sayName(round.question.index, round.question.answer);
    if (got) {
      celebrate("burst", { origin: stageOrigin(), intensity: 0.65 });
      const streak = useSession.getState().streak;
      if (streak === 3 || streak === 5 || streak === 10) {
        window.setTimeout(() => {
          audio.sfx("streak");
          toast(`${streak} in a row!`, { tone: "hi", icon: <IconStar /> });
        }, 350);
      }
    }
  }

  /** Changes the verdict on the card whose answer is still up. Only that card: a new deal ends the chance. */
  function flip(got: boolean) {
    const st = useSession.getState();
    const last = st.rounds.at(-1);
    if (st.phase !== "revealed" || !last || last.correct === got || !st.rejudge(got)) return;
    judgedAt.current = performance.now();
    advanceDir.current = null;
    setFlips((n) => n + 1);
    audio.sfx(got ? "correct" : "wrong");
    haptic(got ? "success" : "error");
    if (got) celebrate("burst", { origin: stageOrigin(), intensity: 0.65 });
    toast(got ? "Changed to Got it!" : "Changed to Missed", { tone: got ? "good" : "bad", icon: got ? <IconCheck /> : <IconX />, ms: 1600, place: "bottom" });
  }

  /** A paddle: judge the card, or change the verdict while its answer is up. */
  function decide(got: boolean) {
    if (useSession.getState().phase === "revealed") flip(got);
    else judge(got);
  }

  function advance(dir?: 1 | -1, manual = false) {
    const st = useSession.getState();
    if (st.phase !== "revealed") return;
    if (manual && performance.now() - judgedAt.current < MIN_REVEAL_MS) return;
    if (dir) advanceDir.current = dir;
    audio.sfx("swipe");
    st.next();
    dealtAt.current = performance.now();
  }

  const pressedThisCard = () => pressCard.current != null && pressCard.current === useSession.getState().current?.index;

  function onTap() {
    if (!pressedThisCard()) return;
    const st = useSession.getState();
    if (st.phase === "revealed") advance(undefined, true);
    else if (!peek) reveal();
  }

  const threshold = Math.round(Math.min(150, Math.max(70, Math.min(vp.w, vp.h) * 0.16)));

  const swipe = useSwipe({
    enabled: live,
    distance: threshold,
    onSwipe: (dir: SwipeDirection) => {
      // A drag that started on the card before this one belonged to that card.
      if (!pressedThisCard()) return;
      haptic("swipe");
      const st = useSession.getState();
      const action = swipeAction(dir, st.phase === "revealed" ? (st.rounds.at(-1)?.correct ?? null) : null);
      if (action?.kind === "judge") judge(action.got);
      else if (action?.kind === "flip") flip(action.got);
      else if (action?.kind === "reveal") reveal();
      else if (action?.kind === "next") advance(action.dir, true);
    },
  });

  // Live hint for which way the card will go if released now. Once judged, only a change of verdict lights up.
  const pull: Verdict | "peek" | null = !swipe.dragging
    ? null
    : swipe.dx >= threshold
      ? "got"
      : swipe.dx <= -threshold
        ? "missed"
        : face === "hidden" && -swipe.dy >= threshold && Math.abs(swipe.dy) > Math.abs(swipe.dx)
          ? "peek"
          : null;
  const armed = judged && pull === verdict ? null : pull;
  useEffect(() => {
    if (!armed) return;
    audio.sfx("select");
    haptic("select");
  }, [armed]);

  // The whole layout takes swipes, so a thumb resting on a paddle can drag the card too. useSwipe grabs the
  // pointer on press, and a grabbed pointer's click would land on the layout, not the paddle under the thumb.
  // So the pointer is grabbed only once the press turns into a drag (as menus/useTapSafeSwipe does).
  const layoutHandlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      pressCard.current = useSession.getState().current?.index ?? null;
      swallowClick.current = false;
      const el = e.currentTarget as { setPointerCapture?: (id: number) => void };
      el.setPointerCapture = () => {};
      try {
        swipe.bind.onPointerDown(e);
      } finally {
        delete el.setPointerCapture;
      }
      const primary = e.isPrimary && (e.pointerType !== "mouse" || e.button === 0);
      const onCard = stage.current?.contains(e.target as Node) ?? false;
      press.current = primary && live ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, onCard, dragged: false } : null;
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const p = press.current;
      if (p && p.id === e.pointerId && !p.dragged && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP) {
        p.dragged = true;
        swallowClick.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The pointer may already be gone; the drag still works inside the layout.
        }
      }
      swipe.bind.onPointerMove(e);
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      swipe.bind.onPointerUp(e);
      const p = press.current;
      press.current = null;
      if (!p || p.id !== e.pointerId || !p.onCard) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TAP_SLOP && e.timeStamp - p.t <= TAP_MS) onTap();
    },
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => {
      swipe.bind.onPointerCancel(e);
      press.current = null;
    },
    onClickCapture: (e: MouseEvent<HTMLDivElement>) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };

  useKeys(
    {
      // Clickers have only these two buttons, so after judging Right always means "next", never a change.
      "ArrowRight|PageDown": () => (useSession.getState().phase === "revealed" ? advance(1, true) : judge(true)),
      "ArrowLeft|PageUp": () => {
        if (useSession.getState().phase !== "revealed") judge(false);
      },
      ArrowUp: () => reveal(),
      "Space|Enter": () => (useSession.getState().phase === "revealed" ? advance(undefined, true) : reveal()),
      "?|h": () => setHelpOpen(true),
    },
    { enabled: live },
  );

  function leave() {
    useSession.getState().quit();
    useNav.getState().back();
  }
  function onBack() {
    const st = useSession.getState();
    if (st.rounds.length > 0 && st.phase !== "done") setConfirmQuit(true);
    else leave();
  }
  // The browser's Back (Safari's edge swipe) does what the Back button does. onBack reads the store, so the first one is fine.
  useEffect(() => onBrowserBack(onBack), []);

  function closeHelp() {
    markHostHelpSeen();
    setHelpOpen(false);
  }

  const narrow = vp.w < 560;
  const title = narrow ? (
    <Display size="xl" className={s.count}>
      {Math.min(index + 1, total)}
      <span className={s.of}>/{total}</span>
    </Display>
  ) : (
    <ProgressDots total={total} current={index} results={rounds.map((r) => r.correct)} />
  );

  const remaining = Math.max(0, total - index - 1);
  /** While the answer is up, the paddle the verdict did not take changes it (see flip). */
  const undoTo: Verdict | null = verdict === "got" ? "missed" : verdict === "missed" ? "got" : null;
  const undoTag = (
    <span className={s.undoTag} aria-hidden="true">
      <IconUndo className={s.undoIcon} />
      Undo
    </span>
  );
  const holdMs = peeked === index ? REVEAL_AFTER_PEEK_MS : REVEAL_MS;

  // Reveal before judging, a hint while peeking, Next once judged. Landscape screens up to the iPad's height
  // put it in the header, so the card (what the crowd sees on the projector) gets the whole body height.
  const compact = vp.orientation === "landscape" && vp.h < 860;
  const centerControl = judged ? (
    <Button
      // A new key restarts the fuse with the hold: after a changed verdict, or when a hidden tab comes back.
      key={`next-${flips}-${hidden}`}
      variant="primary"
      size={compact ? "md" : "lg"}
      sfx={null}
      className={`${s.centerBtn} ${autoAdvance && !hostDemo.holdReveal ? s.timed : ""}`}
      style={{ "--hold": `${holdMs}ms` } as CSSProperties}
      icon={<IconNext className={s.centerIcon} />}
      onPress={(e) => {
        blurIfPointer(e);
        advance(undefined, true);
      }}
    >
      Next
    </Button>
  ) : peek ? (
    <div key="hint" className={s.hint} role="status">
      <IconBack className={s.hintArrow} />
      <span>Did they get it?</span>
      <IconNext className={s.hintArrow} />
    </div>
  ) : (
    <Button
      key="reveal"
      variant="secondary"
      size={compact ? "md" : "lg"}
      sfx={null}
      className={s.centerBtn}
      icon={<IconEye className={s.centerIcon} />}
      onPress={(e) => {
        blurIfPointer(e);
        reveal();
      }}
    >
      Reveal
    </Button>
  );

  return (
    <ScreenFrame
      layout="fill"
      back={onBack}
      headerLeft={
        <div className={s.headerLeft}>
          <BackButton onPress={onBack} />
          <IconButton icon={<IconQuestion />} label="How to play" onPress={() => setHelpOpen(true)} />
        </div>
      }
      title={title}
      headerRight={
        compact ? (
          <div className={s.headerRight}>{centerControl}</div>
        ) : streak >= 2 && !narrow ? (
          <Pill tone="accent" size="lg" icon={<IconStar />}>
            {streak} in a row
          </Pill>
        ) : undefined
      }
    >
      <div className={s.layout} data-face={face} data-compact={compact || undefined} {...layoutHandlers}>
        <div className={`${s.side} ${s.miss}`}>
          <div className={s.paddleWrap} data-armed={armed === "missed" || undefined} data-undo={undoTo === "missed" || undefined}>
            <Button
              variant="danger"
              size="lg"
              sfx={null}
              className={s.paddle}
              icon={<IconX className={s.paddleIcon} />}
              aria-disabled={verdict === "missed" || undefined}
              aria-label={undoTo === "missed" ? "Change to Missed" : undefined}
              onPress={(e) => {
                blurIfPointer(e);
                decide(false);
              }}
            >
              Missed
            </Button>
            <span className={s.tally} aria-label={`${missed} missed`}>
              {missed}
            </span>
            {undoTo === "missed" && undoTag}
          </div>
        </div>

        <div ref={stage} className={s.stage} role="group" aria-label={judged ? "Next card" : peek ? "Swipe right if they got it, left if not" : "Tap to reveal the answer"}>
          <DeckBacks count={remaining} />
          <AnimatePresence custom={exitDir}>
            {current && (
              <motion.div key={current.index} className={s.slot} custom={exitDir} variants={CARD} initial="enter" animate="center" exit="exit">
                <HostCard
                  mon={current.answer}
                  face={face}
                  verdict={verdict}
                  dx={swipe.dx}
                  dy={swipe.dy}
                  dragging={swipe.dragging}
                  threshold={threshold}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <p className="wtp-sr-only" aria-live="polite">
            {face === "hidden" ? "" : `It’s ${current?.answer.name ?? ""}!`}
          </p>
        </div>

        {!compact && <div className={`${s.side} ${s.center}`}>{centerControl}</div>}

        <div className={`${s.side} ${s.got}`}>
          <div className={s.paddleWrap} data-armed={armed === "got" || undefined} data-undo={undoTo === "got" || undefined}>
            <Button
              variant="success"
              size="lg"
              sfx={null}
              className={s.paddle}
              icon={<IconCheck className={s.paddleIcon} />}
              aria-disabled={verdict === "got" || undefined}
              aria-label={undoTo === "got" ? "Change to Got it" : undefined}
              onPress={(e) => {
                blurIfPointer(e);
                decide(true);
              }}
            >
              Got it!
            </Button>
            <span className={s.tally} aria-label={`${correct} got it`}>
              {correct}
            </span>
            {undoTo === "got" && undoTag}
          </div>
        </div>
      </div>

      <HostHelp open={helpOpen} onClose={closeHelp} />
      <ConfirmDialog
        open={confirmQuit}
        title="Stop this game?"
        message={`You’ve played ${rounds.length} of ${total} cards.`}
        confirmLabel="Stop"
        cancelLabel="Keep playing"
        tone="danger"
        onConfirm={() => {
          setConfirmQuit(false);
          leave();
        }}
        onCancel={() => setConfirmQuit(false)}
      />
    </ScreenFrame>
  );
}
