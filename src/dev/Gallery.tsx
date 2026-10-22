// Design-system gallery: every component in every state. Dev and QA only (?lab=gallery).
// ?lab=gallery&view=game shows a full-screen sample game layout built only from the kit.
import { MotionConfig } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { audio } from "../audio";
import { CATALOG } from "../data/catalog";
import type { Mon } from "../data/types";
import { POKE_TYPES } from "../data/types";
import { useReducedMotion } from "../lib/reducedMotion";
import { useThemeAttributes } from "../lib/theme";
import { useKeys } from "../lib/useKeys";
import { useSwipe } from "../lib/useSwipe";
import { useViewport } from "../lib/useViewport";
import { useSettings } from "../state/settings";
import {
  BackButton,
  Backdrop,
  BALL_NAMES,
  Burst,
  Button,
  Card,
  celebrate,
  Chip,
  ChoiceButton,
  ConfirmDialog,
  Display,
  IconButton,
  IconCheck,
  IconExpand,
  IconGear,
  IconPlay,
  IconRefresh,
  IconStar,
  IconTrophy,
  IconVolume,
  Lives,
  Logo,
  Modal,
  Panel,
  Pill,
  PokeArt,
  PokeBall,
  preloadArt,
  ProgressDots,
  ScreenFrame,
  Stat,
  TimerBar,
  TimerRing,
  toast,
  ToastHost,
  TypeBadge,
  type BallKind,
  type ChoiceState,
} from "../ui/components";
import g from "./Gallery.module.css";

const SAMPLE_DEX = [25, 94, 6, 448, 778, 902];
const BALLS: BallKind[] = ["poke", "great", "ultra", "master"];
const LONG_NAMES = ["Crabominable", "Squawkabilly", "Fletchinder", "Mr. Mime", "Type: Null", "Farfetch’d", "Mew"];

const byDex = (dex: number): Mon | undefined => CATALOG.find((m) => m.dex === dex);

function Section({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section id={id} className={g.section}>
      <h2 className={`wtp-display ${g.h2}`}>{title}</h2>
      {note && <p className={g.note}>{note}</p>}
      {children}
    </section>
  );
}

function Row({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className={g.rowWrap}>
      {label && <div className={g.rowLabel}>{label}</div>}
      <div className={g.row}>{children}</div>
    </div>
  );
}

/* ---------------- toolbar ---------------- */
function Toolbar() {
  const theme = useSettings((s) => s.theme);
  const projector = useSettings((s) => s.projector);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const update = useSettings((s) => s.update);
  const vp = useViewport();
  return (
    <div className={g.toolbar}>
      <Chip selected={theme === "spooky"} onPress={() => update({ theme: "spooky" })}>
        Spooky
      </Chip>
      <Chip selected={theme === "classic"} onPress={() => update({ theme: "classic" })}>
        Classic
      </Chip>
      <Chip selected={projector} onPress={() => update({ projector: !projector })}>
        Projector
      </Chip>
      <Chip selected={reduceMotion} onPress={() => update({ reduceMotion: !reduceMotion })}>
        Calm
      </Chip>
      <Button size="md" variant="secondary" icon={<IconPlay />} onPress={() => (location.search = "?lab=gallery&view=game")}>
        Game
      </Button>
      <span className={g.vp}>
        {vp.w}x{vp.h} {vp.size} {vp.orientation}
      </span>
    </div>
  );
}

/* ---------------- sections ---------------- */
function LogoSection() {
  const [run, setRun] = useState(0);
  return (
    <Section id="logo" title="Logo">
      <div className={g.logoHero}>
        <Logo key={run} size="xl" animated bob heading={false} />
      </div>
      <Row>
        <Button variant="ghost" onPress={() => setRun((n) => n + 1)}>
          Replay
        </Button>
        <Logo size="sm" heading={false} />
        <Logo size="md" heading={false} />
      </Row>
    </Section>
  );
}

const SWATCHES = ["--bg-0", "--bg-1", "--bg-2", "--bg-3", "--ink", "--accent", "--hi", "--accent-3", "--good", "--bad", "--surface-strong", "--logo-fill", "--logo-stroke", "--burst-a", "--burst-b"];

function TypeSection() {
  return (
    <Section id="type" title="Type and color" note="Sizes are fluid (vmin). Projector mode multiplies every step by 1.12.">
      <div className={g.typeStack}>
        <Display size="hero">Hero 123</Display>
        <Display size="3xl" color="var(--hi)">
          3XL Pikachu!
        </Display>
        <Display size="2xl">2XL It’s Gengar!</Display>
        <Display size="xl" color="var(--accent)">
          XL Spooky Night
        </Display>
        <Display size="lg">LG Round 4 of 10</Display>
        <p className={g.body}>
          Body text is Fredoka. <b>Bold for emphasis.</b> Kids read the big display words; parents read this.
        </p>
      </div>
      <div className={g.swatches}>
        {SWATCHES.map((v) => (
          <div key={v} className={g.swatch}>
            <span style={{ background: `var(${v})` }} />
            <code>{v}</code>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ButtonSection() {
  return (
    <Section id="buttons" title="Buttons">
      {(["md", "lg", "xl"] as const).map((size) => (
        <Row key={size} label={size}>
          <Button size={size} variant="primary" icon={<IconPlay />}>
            Play
          </Button>
          <Button size={size} variant="secondary">
            Host mode
          </Button>
          <Button size={size} variant="success" icon={<IconCheck />}>
            Got it
          </Button>
          <Button size={size} variant="danger">
            Quit
          </Button>
          <Button size={size} variant="ghost">
            Skip
          </Button>
        </Row>
      ))}
      <Row label="icon + ball, icon only, disabled">
        <Button size="lg" icon={<PokeBall kind="master" />}>
          Master
        </Button>
        <Button size="lg" icon={<IconTrophy />} aria-label="Leaderboard" />
        <Button size="lg" disabled>
          Disabled
        </Button>
        <Button size="lg" block variant="secondary">
          Block width
        </Button>
      </Row>
    </Section>
  );
}

const STATES: ChoiceState[] = ["idle", "picked", "correct", "wrong", "dimmed"];

function useSampleRound(answer: string, options: string[]) {
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const correctIndex = options.indexOf(answer);
  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    window.setTimeout(() => {
      setRevealed(true);
      if (i === correctIndex) {
        audio.sfx("correct");
        celebrate("burst", { intensity: 0.7 });
      } else audio.sfx("wrong");
    }, 450);
  };
  const reset = () => {
    setPicked(null);
    setRevealed(false);
  };
  const stateOf = (i: number): ChoiceState => {
    if (picked === null) return "idle";
    if (!revealed) return i === picked ? "picked" : "idle";
    if (i === correctIndex) return "correct";
    if (i === picked) return "wrong";
    return "dimmed";
  };
  return { pick, reset, stateOf, revealed, picked };
}

function AnswerSection() {
  const options = ["Pikachu", "Crabominable", "Mr. Mime", "Fletchinder"];
  const round = useSampleRound("Pikachu", options);
  useKeys({ "1|2|3|4": (e) => round.pick(Number(e.key) - 1) });
  return (
    <Section id="answers" title="Answer buttons" note="Tap one (or press 1-4). Badges hide on touch-only devices.">
      <div className={g.states}>
        {STATES.map((st, i) => (
          <ChoiceButton key={st} label={st === "idle" ? "Pikachu" : st[0].toUpperCase() + st.slice(1)} state={st} hint={i + 1} />
        ))}
      </div>
      <div className={g.longNames}>
        {LONG_NAMES.map((n, i) => (
          <ChoiceButton key={n} label={n} hint={(i % 4) + 1} />
        ))}
      </div>
      <div className={g.answerDemos}>
        <div>
          <div className={g.rowLabel}>2x2 grid (live)</div>
          <div className={g.grid2}>
            {options.map((n, i) => (
              <ChoiceButton key={n} label={n} hint={i + 1} state={round.stateOf(i)} onPress={() => round.pick(i)} />
            ))}
          </div>
          <Button variant="ghost" onPress={round.reset}>
            Reset
          </Button>
        </div>
        <div>
          <div className={g.rowLabel}>1x4 column</div>
          <div className={g.grid1}>
            {options.map((n, i) => (
              <ChoiceButton key={n} label={n} hint={i + 1} state={i === 2 ? "wrong" : i === 0 ? "correct" : "dimmed"} />
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function ArtSection() {
  const mons = useMemo(() => SAMPLE_DEX.map((dex) => ({ dex, mon: byDex(dex) })), []);
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const all = mons.every(({ dex, mon }) => !mon || shown[dex]);
  useEffect(() => {
    void preloadArt(mons.flatMap(({ mon }) => (mon ? [mon] : [])));
  }, [mons]);
  return (
    <Section id="art" title="Silhouettes" note="Tap a stage to reveal. Uses mon.bbox when the catalog has it.">
      <Row>
        <Button
          variant={all ? "ghost" : "primary"}
          icon={<IconStar />}
          sfx={all ? "tap" : "reveal"}
          onPress={() => setShown(all ? {} : Object.fromEntries(SAMPLE_DEX.map((d) => [d, true])))}
        >
          {all ? "Hide all" : "Reveal all"}
        </Button>
      </Row>
      <div className={g.stages}>
        {mons.map(({ dex, mon }) => (
          <button
            key={dex}
            type="button"
            className={g.stage}
            onClick={() => {
              if (!mon) return;
              audio.sfx(shown[dex] ? "tap" : "reveal");
              setShown((s) => ({ ...s, [dex]: !s[dex] }));
            }}
          >
            <Burst intensity={shown[dex] ? 1 : 0.6} />
            {mon ? (
              <PokeArt mon={mon} revealed={Boolean(shown[dex])} />
            ) : (
              <span className={g.missing}>#{dex} is not in the catalog yet</span>
            )}
            <span className={`wtp-display ${g.stageName}`}>{mon ? (shown[dex] ? mon.name : "?????") : `#${dex}`}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function BallSection() {
  return (
    <Section id="balls" title="Poké Balls">
      <Row label="sizes">
        {BALLS.map((b) => (
          <div key={b} className={g.ballCell}>
            <PokeBall kind={b} size={96} title={BALL_NAMES[b]} />
            <PokeBall kind={b} size={56} />
            <PokeBall kind={b} size={28} />
            <span>{BALL_NAMES[b]}</span>
          </div>
        ))}
      </Row>
      <Row label="wobble, spin, bounce, empty">
        <PokeBall kind="poke" size={72} animate="wobble" />
        <PokeBall kind="great" size={72} animate="spin" />
        <PokeBall kind="ultra" size={72} animate="bounce" />
        <PokeBall kind="master" size={72} empty />
      </Row>
    </Section>
  );
}

function BadgeSection() {
  const [sel, setSel] = useState("all");
  return (
    <Section id="badges" title="Types, pills and chips">
      <div className={g.types}>
        {POKE_TYPES.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
      </div>
      <Row label="pills">
        <Pill>Round 4</Pill>
        <Pill tone="accent" icon={<IconStar />}>
          x3 streak
        </Pill>
        <Pill tone="good">+250</Pill>
        <Pill tone="bad">Missed</Pill>
        <Pill tone="hi" size="lg">
          NEW BEST!
        </Pill>
        <TypeBadge type="ghost" size="sm" />
        <TypeBadge type="electric" size="lg" />
      </Row>
      <Row label="chips">
        {["all", "kanto", "johto", "hoenn"].map((id) => (
          <Chip key={id} selected={sel === id} onPress={() => setSel(id)}>
            {id === "all" ? "All regions" : id[0].toUpperCase() + id.slice(1)}
          </Chip>
        ))}
        <Chip selected accent="var(--type-ghost)">
          Ghost
        </Chip>
      </Row>
    </Section>
  );
}

function PanelSection() {
  const [sel, setSel] = useState(1);
  const cards = [
    { dex: 94, label: "Spooky Night", accent: "#ff7a1a" },
    { dex: 25, label: "All Pokémon", accent: "#ffcb05" },
    { dex: 150, label: "Legendary", accent: "#7b5cff" },
  ];
  return (
    <Section id="panels" title="Panels and cards">
      <div className={g.panels}>
        <Panel>
          <Display size="lg">Glass panel</Display>
          <p className={g.panelText}>The backdrop shows through. Projector mode makes it solid.</p>
        </Panel>
        <Panel tone="solid">
          <Display size="lg" color="var(--hi)">
            Solid panel
          </Display>
          <p className={g.panelText}>Opaque, for dense content like the leaderboard.</p>
        </Panel>
      </div>
      <div className={g.cards}>
        {cards.map((c, i) => {
          const mon = byDex(c.dex);
          return (
            <Card key={c.label} accent={c.accent} selected={sel === i} onPress={() => setSel(i)}>
              <div className={g.cardArt}>{mon && <PokeArt mon={mon} revealed outline={false} />}</div>
              <Display size="lg">{c.label}</Display>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

function HeaderSection() {
  return (
    <Section id="icons" title="Header buttons">
      <Row>
        <BackButton onPress={() => toast("Back!")} />
        <BackButton onPress={() => toast("Back!")} showLabel={false} />
        <IconButton icon={<IconGear />} label="Settings" />
        <IconButton icon={<IconVolume />} label="Sound" variant="ghost" />
        <IconButton icon={<IconExpand />} label="Fullscreen" />
        <IconButton icon={<IconTrophy />} label="Scores" showLabel variant="primary" />
        <IconButton icon={<IconGear />} label="Settings" size="lg" />
      </Row>
    </Section>
  );
}

function HudSection() {
  const [score, setScore] = useState(1250);
  const results = [true, true, false, true];
  return (
    <Section id="hud" title="HUD">
      <Row label="stat (tap +250)">
        <Stat value={score} label="Score" />
        <Stat value={4} label="Streak" color="var(--accent)" size="md" />
        <Stat value="7/10" label="Correct" size="xl" color="var(--good)" />
        <Button variant="success" onPress={() => setScore((s) => s + 250)}>
          +250
        </Button>
      </Row>
      <Row label="progress dots">
        <ProgressDots total={10} current={4} results={results} />
      </Row>
      <Row label="20 rounds">
        <ProgressDots total={20} current={11} results={[true, false, true, true, false, true, true, true, false, true, true]} />
      </Row>
      <div className={g.timers}>
        <TimerBar fraction={1} label="20" />
        <TimerBar fraction={0.5} label="10" />
        <TimerBar fraction={0.1} urgent label="2" />
      </div>
      <Row label="timer ring 100 / 50 / 10% urgent">
        <TimerRing fraction={1} label={20} />
        <TimerRing fraction={0.5} label={10} />
        <TimerRing fraction={0.1} urgent label={2} />
      </Row>
      <Row label="lives">
        <Lives total={3} remaining={3} />
        <Lives total={3} remaining={2} />
        <Lives total={3} remaining={0} ball="great" />
      </Row>
    </Section>
  );
}

function FeedbackSection() {
  const [modal, setModal] = useState<"none" | "dialog" | "sheet" | "confirm">("none");
  return (
    <Section id="feedback" title="Feedback">
      <Row label="toast">
        <Button variant="ghost" onPress={() => toast("Sound is on")}>
          Info
        </Button>
        <Button variant="success" onPress={() => toast("Saved!", { tone: "good", icon: <IconCheck /> })}>
          Good
        </Button>
        <Button variant="danger" onPress={() => toast("No more lives", { tone: "bad" })}>
          Bad
        </Button>
        <Button variant="secondary" onPress={() => toast("x5 streak!", { tone: "hi", icon: <IconStar /> })}>
          Hi
        </Button>
        <Button variant="ghost" onPress={() => toast("Turn the iPad sideways for the big screen!", { tone: "hi", icon: <IconRefresh />, place: "bottom" })}>
          Bottom
        </Button>
      </Row>
      <Row label="confetti (off when calm)">
        <Button sfx="pop" onPress={() => celebrate("burst")}>
          Burst
        </Button>
        <Button sfx="fanfare" onPress={() => celebrate("cannons")}>
          Cannons
        </Button>
        <Button sfx="pop" variant="secondary" onPress={() => celebrate("stars")}>
          Stars
        </Button>
        <Button sfx="pop" variant="ghost" onPress={() => celebrate("rain")}>
          Rain
        </Button>
      </Row>
      <Row label="dialogs">
        <Button variant="secondary" onPress={() => setModal("dialog")}>
          Dialog
        </Button>
        <Button variant="secondary" onPress={() => setModal("sheet")}>
          Sheet
        </Button>
        <Button variant="danger" onPress={() => setModal("confirm")}>
          Quit game?
        </Button>
      </Row>
      <Modal
        open={modal === "dialog" || modal === "sheet"}
        variant={modal === "sheet" ? "sheet" : "dialog"}
        onClose={() => setModal("none")}
        title="Great job!"
        actions={
          <Button size="lg" onPress={() => setModal("none")}>
            OK
          </Button>
        }
      >
        You got 8 out of 10. Grab a big candy!
      </Modal>
      <ConfirmDialog
        open={modal === "confirm"}
        title="Quit this game?"
        message="Your score will not be saved."
        confirmLabel="Quit"
        cancelLabel="Keep playing"
        tone="danger"
        onConfirm={() => {
          setModal("none");
          toast("Quit", { tone: "bad" });
        }}
        onCancel={() => setModal("none")}
      />
    </Section>
  );
}

function SwipeSection() {
  const [last, setLast] = useState("none yet");
  const swipe = useSwipe({
    onSwipe: (dir, info) => {
      audio.sfx("swipe");
      setLast(`${dir} at ${Math.round(info.velocity * 1000)} px/s`);
    },
  });
  const [key, setKey] = useState("none yet");
  useKeys({
    "ArrowLeft|ArrowRight|ArrowUp|ArrowDown|PageUp|PageDown|Space|Enter|Escape": (e) => setKey(e.key === " " ? "Space" : e.key),
  });
  return (
    <Section id="input" title="Swipe and keys" note="Drag the card (touch, pen or mouse). Clicker keys show below.">
      <div className={g.swipeArea}>
        <div
          {...swipe.bind}
          className={g.swipeCard}
          data-dragging={swipe.dragging || undefined}
          style={{
            ...swipe.bind.style,
            transform: `translate(${swipe.dx}px, ${swipe.dy}px) rotate(${swipe.dx / 18}deg)`,
          }}
        >
          <PokeBall kind="ultra" size={64} />
          <Display size="lg">Swipe me</Display>
        </div>
      </div>
      <Row>
        <Pill size="lg">Last swipe: {last}</Pill>
        <Pill size="lg">Last key: {key}</Pill>
        <Pill size="lg">
          dx {Math.round(swipe.dx)} dy {Math.round(swipe.dy)}
        </Pill>
      </Row>
    </Section>
  );
}

function Sheet() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("wtp-scroll");
    if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
    return () => html.classList.remove("wtp-scroll");
  }, []);
  return (
    <div className={g.page}>
      <Toolbar />
      <LogoSection />
      <TypeSection />
      <ButtonSection />
      <AnswerSection />
      <ArtSection />
      <BallSection />
      <BadgeSection />
      <PanelSection />
      <HeaderSection />
      <HudSection />
      <FeedbackSection />
      <SwipeSection />
    </div>
  );
}

/* ---------------- full-screen sample game ---------------- */
const GAME_ROUNDS: { answer: number; options: string[] }[] = [
  { answer: 25, options: ["Pikachu", "Crabominable", "Mr. Mime", "Fletchinder"] },
  { answer: 94, options: ["Haunter", "Gengar", "Squawkabilly", "Mimikyu"] },
  { answer: 6, options: ["Charmeleon", "Dragonite", "Charizard", "Type: Null"] },
  { answer: 448, options: ["Riolu", "Zeraora", "Farfetch’d", "Lucario"] },
  { answer: 778, options: ["Mimikyu", "Pikachu", "Brambleghast", "Mew"] },
];

function SampleGame() {
  const params = new URLSearchParams(location.search);
  const [index, setIndex] = useState(Number(params.get("q") ?? 0) % GAME_ROUNDS.length);
  const round = GAME_ROUNDS[index];
  const mon = byDex(round.answer)!;
  const play = useSampleRound(mon.name, round.options);
  const [results, setResults] = useState<boolean[]>([]);
  const [tick, setTick] = useState(1);

  useEffect(() => {
    const pick = params.get("pick");
    if (pick !== null && index === Number(params.get("q") ?? 0)) play.pick(Number(pick));
  }, []);

  useEffect(() => {
    if (play.picked !== null) return;
    const id = window.setInterval(() => setTick((t) => Math.max(0, t - 0.01)), 150);
    return () => window.clearInterval(id);
  }, [play.picked, index]);

  useEffect(() => {
    void preloadArt(GAME_ROUNDS.map((r) => byDex(r.answer)!));
  }, []);

  const next = () => {
    if (!play.revealed) return;
    setResults((r) => [...r, play.picked === round.options.indexOf(mon.name)]);
    setIndex((i) => (i + 1) % GAME_ROUNDS.length);
    setTick(1);
    play.reset();
    audio.sfx("whoosh");
  };

  useKeys({ "1|2|3|4": (e) => play.pick(Number(e.key) - 1), "ArrowRight|PageDown|Space|Enter": next });

  return (
    <div className="wtp-screen">
      <ScreenFrame
        layout="split"
        back={() => (location.search = "?lab=gallery")}
        title={<ProgressDots total={10} current={results.length} results={results} />}
        headerRight={<Stat value={results.filter(Boolean).length * 250} label="Score" size="md" />}
      >
        <div className={g.gameStage}>
          <Burst intensity={play.revealed ? 1 : 0.65} />
          <PokeArt key={mon.dex} mon={mon} revealed={play.revealed} />
        </div>
        <div className={g.gameSide}>
          <Display size="2xl" className={g.gameTitle} color={play.revealed ? "var(--hi)" : undefined}>
            {play.revealed ? `It’s ${mon.name}!` : "Who’s that Pokémon?"}
          </Display>
          <TimerBar fraction={tick} urgent={tick < 0.25} />
          <div className={g.grid2}>
            {round.options.map((n, i) => (
              <ChoiceButton key={n} label={n} hint={i + 1} state={play.stateOf(i)} onPress={() => play.pick(i)} />
            ))}
          </div>
          <div className={g.nextSlot}>
            {play.revealed && (
              <Button size="lg" variant="primary" icon={<IconPlay />} onPress={next} sfx={null}>
                Next
              </Button>
            )}
          </div>
        </div>
      </ScreenFrame>
    </div>
  );
}

export default function Gallery() {
  useThemeAttributes();
  const reduce = useReducedMotion();
  const view = new URLSearchParams(location.search).get("view");
  return (
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <Backdrop />
      {view === "game" ? <SampleGame /> : <Sheet />}
      <ToastHost />
    </MotionConfig>
  );
}
