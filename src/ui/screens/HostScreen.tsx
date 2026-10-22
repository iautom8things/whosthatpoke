// Host mode ("Shout it out!"): a grown-up holds the iPad, the projector mirrors it, kids shout the name.
// Swipe right = got it, left = missed, up or tap = peek first. Buttons and keys do the same.
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { announcer, audio } from "../../audio";
import { haptic } from "../../lib/haptic";
import { useKeys } from "../../lib/useKeys";
import { useSwipe, type SwipeDirection } from "../../lib/useSwipe";
import { useViewport } from "../../lib/useViewport";
import { useNav } from "../../state/nav";
import { useSession } from "../../state/session";
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
  preloadArt,
  ProgressDots,
  ScreenFrame,
  toast,
} from "../components";
import { hostDemo, hostHelpSeen, markHostHelpSeen } from "./host/flags";
import s from "./host/Host.module.css";
import { DeckBacks, HostCard, type CardFace, type Verdict } from "./host/HostCard";
import { HostHelp } from "./host/HostHelp";

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

/** Remembers a press so a short tap (no drag) can peek. useSwipe ignores taps on purpose. */
interface TapStart {
  id: number;
  x: number;
  y: number;
  t: number;
}
const TAP_SLOP = 10;
const TAP_MS = 600;

const blurIfPointer = (e: MouseEvent<HTMLButtonElement>) => {
  // A mouse or finger press leaves focus on the button; Space would then press it again.
  if (e.detail > 0) e.currentTarget.blur();
};

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
  const judgedAt = useRef(0);
  const advanceDir = useRef<1 | -1 | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const tap = useRef<TapStart | null>(null);

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
    return () => announcer.cancel();
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

  // A new card: the sting, "Who's that Pokémon?", then the round is on.
  const dex = current?.answer.dex;
  useEffect(() => {
    if (phase !== "intro" || dex == null || helpOpen) return;
    const sting = window.setTimeout(() => {
      audio.sfx("whosThat");
      void announcer.say("Who’s that Pokémon?");
    }, 120);
    const ask = window.setTimeout(() => useSession.getState().beginAsking(), INTRO_MS);
    return () => {
      window.clearTimeout(sting);
      window.clearTimeout(ask);
    };
  }, [phase, dex, helpOpen]);

  useEffect(() => {
    if (current) void preloadArt([current.answer]);
  }, [current]);

  // After judging: hold the answer up, then deal the next card.
  useEffect(() => {
    if (phase !== "revealed" || !autoAdvance || helpOpen || confirmQuit || hostDemo.holdReveal) return;
    const ms = peeked === index ? REVEAL_AFTER_PEEK_MS : REVEAL_MS;
    const t = window.setTimeout(() => advance(), ms);
    return () => window.clearTimeout(t);
    // advance reads fresh state from the store; the round index is what restarts the clock.
  }, [phase, index, autoAdvance, helpOpen, confirmQuit]);

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

  function reveal() {
    const st = useSession.getState();
    if (!st.current || (st.phase !== "asking" && st.phase !== "intro") || peeked === st.current.index) return;
    setPeeked(st.current.index);
    audio.sfx("reveal");
    haptic("select");
    void announcer.say(`It’s ${st.current.answer.say}!`);
  }

  function judge(got: boolean) {
    const st = useSession.getState();
    if (!st.current || (st.phase !== "asking" && st.phase !== "intro")) return;
    const wasPeeked = peeked === st.current.index;
    const round = st.judge(got);
    if (!round) return;
    judgedAt.current = performance.now();
    advanceDir.current = null;
    audio.sfx(got ? "correct" : "wrong");
    haptic(got ? "success" : "error");
    if (!wasPeeked) void announcer.say(`It’s ${round.question.answer.say}!`);
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

  function advance(dir?: 1 | -1, manual = false) {
    const st = useSession.getState();
    if (st.phase !== "revealed") return;
    if (manual && performance.now() - judgedAt.current < MIN_REVEAL_MS) return;
    if (dir) advanceDir.current = dir;
    audio.sfx("swipe");
    st.next();
  }

  function onTap() {
    const st = useSession.getState();
    if (st.phase === "revealed") advance(undefined, true);
    else if (!peek) reveal();
  }

  const threshold = Math.round(Math.min(150, Math.max(70, Math.min(vp.w, vp.h) * 0.16)));

  const swipe = useSwipe({
    enabled: live,
    distance: threshold,
    onSwipe: (dir: SwipeDirection) => {
      haptic("swipe");
      if (useSession.getState().phase === "revealed") {
        if (dir === "left" || dir === "right") advance(dir === "right" ? 1 : -1, true);
        else if (dir === "up") advance(undefined, true);
        return;
      }
      if (dir === "right") judge(true);
      else if (dir === "left") judge(false);
      else if (dir === "up") reveal();
    },
  });

  // Live hint for which way the card will go if released now.
  const armed: Verdict | "peek" | null =
    !swipe.dragging || judged
      ? null
      : swipe.dx >= threshold
        ? "got"
        : swipe.dx <= -threshold
          ? "missed"
          : face === "hidden" && -swipe.dy >= threshold && Math.abs(swipe.dy) > Math.abs(swipe.dx)
            ? "peek"
            : null;
  useEffect(() => {
    if (!armed) return;
    audio.sfx("select");
    haptic("select");
  }, [armed]);

  const stageHandlers = {
    ...swipe.bind,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      swipe.bind.onPointerDown(e);
      const primary = e.isPrimary && (e.pointerType !== "mouse" || e.button === 0);
      tap.current = primary && live ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      swipe.bind.onPointerUp(e);
      const t = tap.current;
      tap.current = null;
      if (!t || t.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) <= TAP_SLOP && e.timeStamp - t.t <= TAP_MS) onTap();
    },
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => {
      swipe.bind.onPointerCancel(e);
      tap.current = null;
    },
  };

  useKeys(
    {
      "ArrowRight|PageDown": () => (judged ? advance(1, true) : judge(true)),
      "ArrowLeft|PageUp": () => {
        if (!judged) judge(false);
      },
      ArrowUp: () => reveal(),
      "Space|Enter": () => (judged ? advance(undefined, true) : reveal()),
      "?|h": () => setHelpOpen(true),
    },
    { enabled: live },
  );

  function leave() {
    useSession.getState().quit();
    useNav.getState().back();
  }
  const onBack = () => (rounds.length > 0 && phase !== "done" ? setConfirmQuit(true) : leave());

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
  const holdMs = peeked === index ? REVEAL_AFTER_PEEK_MS : REVEAL_MS;

  // Reveal before judging, a hint while peeking, Next once judged. Short landscape screens put it in the header.
  const compact = vp.orientation === "landscape" && vp.h < 600;
  const centerControl = judged ? (
    <Button
      key="next"
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
      <div className={s.layout} data-face={face} data-compact={compact || undefined}>
        <div className={`${s.side} ${s.miss}`}>
          <div className={s.paddleWrap} data-armed={armed === "missed" || undefined} data-dim={(judged && verdict !== "missed") || undefined}>
            <Button
              variant="danger"
              size="lg"
              sfx={null}
              className={s.paddle}
              icon={<IconX className={s.paddleIcon} />}
              aria-disabled={judged || undefined}
              onPress={(e) => {
                blurIfPointer(e);
                judge(false);
              }}
            >
              Missed
            </Button>
            <span className={s.tally} aria-label={`${missed} missed`}>
              {missed}
            </span>
          </div>
        </div>

        <div ref={stage} className={s.stage} {...stageHandlers} role="group" aria-label={judged ? "Next card" : peek ? "Swipe right if they got it, left if not" : "Tap to peek at the answer"}>
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
          <div className={s.paddleWrap} data-armed={armed === "got" || undefined} data-dim={(judged && verdict !== "got") || undefined}>
            <Button
              variant="success"
              size="lg"
              sfx={null}
              className={s.paddle}
              icon={<IconCheck className={s.paddleIcon} />}
              aria-disabled={judged || undefined}
              onPress={(e) => {
                blurIfPointer(e);
                judge(true);
              }}
            >
              Got it!
            </Button>
            <span className={s.tally} aria-label={`${correct} got it`}>
              {correct}
            </span>
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
