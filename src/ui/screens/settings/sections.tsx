// The smaller Settings tabs: Sound, Game, Look, Party tools and About.
import { useState, useSyncExternalStore } from "react";
import { announcer, whosThat } from "../../../audio";
import { artUrl, CATALOG } from "../../../data/catalog";
import { clearRecent, recentAnswers } from "../../../game/history";
import { leaderboard } from "../../../game/leaderboard";
import { useFullscreen } from "../../../lib/useFullscreen";
import { useSettings, type Theme } from "../../../state/settings";
import { Button, Card, ConfirmDialog, Display, IconPlay, IconRefresh, Pill, toast } from "../../components";
import { Choices, Level, Row, SectionTitle, SwitchRow } from "./controls";
import { IconTrash } from "./icons";
import s from "./Settings.module.css";

/* ---------------- Sound ---------------- */

export function SoundSection() {
  const musicVolume = useSettings((st) => st.musicVolume);
  const sfxVolume = useSettings((st) => st.sfxVolume);
  const voice = useSettings((st) => st.voice);
  const update = useSettings((st) => st.update);

  // The same sting and delay as a real question, so the voice comes in after the jingle, not under it.
  const test = () => void whosThat();

  return (
    <>
      <SectionTitle>Sound</SectionTitle>
      <Row label="Music" hint="Catchy tunes in the menus, suspense music during questions.">
        <Level label="Music volume" value={musicVolume} sfx={null} onChange={(v) => update({ musicVolume: v })} />
      </Row>
      <Row label="Sound effects" hint="Dings, buzzers and the big candy fanfare.">
        <Level label="Effects volume" value={sfxVolume} sfx="correct" onChange={(v) => update({ sfxVolume: v })} />
      </Row>
      <SwitchRow
        label="Announcer voice"
        hint={announcer.supported ? "Says “Who’s that Pokémon?”, reads the four names on Poké Ball, then names the Pokémon and reads its fun fact." : "This device has no speaking voice, so this stays quiet."}
        on={voice}
        disabled={!announcer.supported}
        onChange={(on) => update({ voice: on })}
      />
      <Row label="Test it" hint="No sound? Check the volume buttons and the silent switch.">
        <Button variant="secondary" icon={<IconPlay />} sfx={null} onPress={test}>
          Test sound
        </Button>
      </Row>
    </>
  );
}

/* ---------------- Game ---------------- */

const ROUND_OPTIONS = [5, 10, 15].map((n) => ({ value: n, label: String(n) }));

export function GameSection() {
  const rounds = useSettings((st) => st.rounds);
  const timer = useSettings((st) => st.timer);
  const autoAdvance = useSettings((st) => st.autoAdvance);
  const update = useSettings((st) => st.update);
  return (
    <>
      <SectionTitle>Game</SectionTitle>
      <Row label="Questions per game" hint="5 is quick for little ones. 15 is a real challenge.">
        <Choices label="Questions per game" value={rounds} options={ROUND_OPTIONS} onChange={(n) => update({ rounds: n })} />
      </Row>
      <SwitchRow label="Timer" hint="A countdown on every question, with bonus points for speed. Off means no rush, and every right answer scores as if it were instant." on={timer} onChange={(on) => update({ timer: on })} />
      <SwitchRow label="Auto next" hint="After the answer shows, the next one starts by itself." on={autoAdvance} onChange={(on) => update({ autoAdvance: on })} />
    </>
  );
}

/* ---------------- Look ---------------- */

const PIKACHU = CATALOG.find((m) => m.dex === 25);

const THEMES: { id: Theme; name: string; blurb: string }[] = [
  { id: "spooky", name: "Spooky Night", blurb: "Moon, bats and pumpkins" },
  { id: "classic", name: "Classic", blurb: "The TV show’s blue burst" },
];

function ThemeSwatch({ id }: { id: Theme }) {
  return (
    <span className={s.swatch} data-look={id} aria-hidden="true">
      {id === "spooky" && (
        <>
          <span className={s.swatchMoon} />
          <span className={s.swatchHill} />
          <span className={s.swatchPumpkin}>🎃</span>
        </>
      )}
      <span className={s.swatchGlow} />
      {PIKACHU && <img className={s.swatchMon} src={artUrl(PIKACHU)} alt="" draggable={false} />}
    </span>
  );
}

export function LookSection() {
  const theme = useSettings((st) => st.theme);
  const projector = useSettings((st) => st.projector);
  const reduceMotion = useSettings((st) => st.reduceMotion);
  const update = useSettings((st) => st.update);
  return (
    <>
      <SectionTitle>Look</SectionTitle>
      <div className={s.themes} role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <Card key={t.id} className={s.themeCard} selected={theme === t.id} accent={t.id === "spooky" ? "#ff8a1f" : "#2a75f0"} onPress={() => update({ theme: t.id })}>
            <ThemeSwatch id={t.id} />
            <span className={s.themeName}>
              <Display size="md">{t.name}</Display>
              <span className={s.themeBlurb}>{t.blurb}</span>
            </span>
          </Card>
        ))}
      </div>
      <SwitchRow label="Projector mode" hint="Bigger words, thicker outlines and solid colors. Turn on for a projector, even a dim one." on={projector} onChange={(on) => update({ projector: on })} />
      <SwitchRow label="Calm motion" hint="Stops the spinning, bouncing and confetti. Good for kids who get dizzy." on={reduceMotion} onChange={(on) => update({ reduceMotion: on })} />
    </>
  );
}

/* ---------------- Party tools ---------------- */

const ATTRACT_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 30, label: "30 s" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
];

type Pending = "scores" | "recent" | "settings" | null;

const CONFIRM: Record<Exclude<Pending, null>, { title: string; label: string }> = {
  scores: { title: "Clear the leaderboard?", label: "Clear it" },
  recent: { title: "Forget recent Pokémon?", label: "Forget them" },
  settings: { title: "Restore all settings?", label: "Restore" },
};

export function PartySection() {
  const attractAfterSec = useSettings((st) => st.attractAfterSec);
  const update = useSettings((st) => st.update);
  const reset = useSettings((st) => st.reset);
  const fullscreen = useFullscreen();
  const scores = useSyncExternalStore(leaderboard.subscribe, leaderboard.all).length;
  const [recent, setRecent] = useState(() => recentAnswers().length);
  const [pending, setPending] = useState<Pending>(null);

  const confirm = () => {
    if (pending === "scores") {
      leaderboard.clear();
      toast("Leaderboard cleared. Fresh start!", { tone: "good" });
    } else if (pending === "recent") {
      clearRecent();
      setRecent(0);
      toast("All Pokémon are back in the mix!", { tone: "good" });
    } else if (pending === "settings") {
      reset();
      toast("Settings are back to the start.", { tone: "good" });
    }
    setPending(null);
  };

  return (
    <>
      <SectionTitle>Party tools</SectionTitle>
      <Row label="Show-off mode" hint="When nobody plays for a while, the title screen turns into a Pokémon slideshow.">
        <Choices label="Show-off mode delay" value={attractAfterSec} options={ATTRACT_OPTIONS} onChange={(n) => update({ attractAfterSec: n })} />
      </Row>
      <SwitchRow
        label="Full screen"
        hint={fullscreen.supported ? "Hides the browser bars. Press Esc on a laptop to leave." : "Not on this browser. On iPad, add it to the Home Screen instead (see Offline)."}
        on={fullscreen.active}
        disabled={!fullscreen.supported}
        onChange={() => void fullscreen.toggle()}
      />
      <Row label="Leaderboard" hint={scores === 0 ? "No scores yet." : `${scores} ${scores === 1 ? "score" : "scores"} saved on this device.`}>
        {scores > 0 && (
          <Button variant="danger" icon={<IconTrash />} onPress={() => setPending("scores")}>
            Clear
          </Button>
        )}
      </Row>
      <Row
        label="Recently shown Pokémon"
        hint={recent === 0 ? "Nothing to skip yet. Every Pokémon can come up." : `The last ${recent} are skipped so kids see new ones.`}
      >
        {recent > 0 && (
          <Button variant="danger" icon={<IconTrash />} onPress={() => setPending("recent")}>
            Forget
          </Button>
        )}
      </Row>
      <Row label="All settings" hint="Lost in here? Put every setting back to how it started.">
        <Button variant="danger" icon={<IconRefresh />} onPress={() => setPending("settings")}>
          Restore
        </Button>
      </Row>
      <ConfirmDialog
        open={pending !== null}
        tone="danger"
        title={pending ? CONFIRM[pending].title : ""}
        message={
          pending === "scores"
            ? `All ${scores} ${scores === 1 ? "score" : "scores"} on this device go away for good.`
            : pending === "settings"
              ? "Sound, game, look, prizes and party settings go back to the start, custom prizes too. Scores stay."
              : "Pokémon from earlier games can show up again right away."
        }
        confirmLabel={pending ? CONFIRM[pending].label : ""}
        cancelLabel="Keep"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

/* ---------------- About ---------------- */

export function AboutSection() {
  return (
    <>
      <SectionTitle>About</SectionTitle>
      <div className={s.about}>
        <div className={s.aboutLead}>
          <img className={s.aboutIcon} src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
          <p>
            <Pill tone="hi" size="sm">
              Fan-made
            </Pill>{" "}
            A silhouette guessing game for one spooky driveway.
          </p>
        </div>
        <dl className={s.credits}>
          <div>
            <dt>Art</dt>
            <dd>Pokémon artwork from the PokeAPI sprites, packed by iautom8things/pkmn_svgs.</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>Names, types and Pokédex facts from PokeAPI.</dd>
          </div>
          <div>
            <dt>Music</dt>
            <dd>Original tunes and sounds, made live in the browser.</dd>
          </div>
        </dl>
        <p className={s.legal}>
          Pokémon and character names are trademarks of Nintendo, Creatures and GAME FREAK. Fan-made for a family party.
        </p>
      </div>
    </>
  );
}
