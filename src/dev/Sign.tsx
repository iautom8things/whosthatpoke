// Printable "Play at home!" sign for the party (?lab=sign): US Letter on white paper, thin lines, no full-bleed color.
// Print it from the browser (Letter, no margins, background graphics on), or save a PDF as qa/README.md shows.
import { useEffect } from "react";
import { PLAY_URL } from "../data/playQr";
import { Logo, PlayQr, PokeBall, type BallKind } from "../ui/components";
import s from "./Sign.module.css";

const BALLS: BallKind[] = ["poke", "great", "ultra", "master"];
const SHORT_URL = PLAY_URL.replace(/^https:\/\//, "").replace(/\/$/, "");

export default function Sign() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("wtp-scroll", "wtp-sign");
    document.title = "Play at home sign";
    return () => html.classList.remove("wtp-scroll", "wtp-sign");
  }, []);

  return (
    <main className={s.page}>
      <Logo size="xl" className={s.logo} />
      <h2 className={`wtp-display ${s.headline}`}>Play at home!</h2>
      <p className={s.lede}>Point your phone’s camera at the code. Free, no app, no sign-up.</p>

      <div className={s.stage}>
        <img className={s.peekLeft} src="pokemon/25.svg" alt="" />
        <div className={s.frame}>
          <PlayQr title="QR code to play Who’s That Pokémon? at home" className={s.qr} />
        </div>
        <img className={s.peekRight} src="pokemon/778.svg" alt="" />
      </div>

      <p className={s.url}>{SHORT_URL}</p>
      <footer className={s.foot}>
        <span className={s.balls}>
          {BALLS.map((b) => (
            <PokeBall key={b} kind={b} size="100%" />
          ))}
        </span>
        <span>1,025 Pokémon. Four levels. Any phone, tablet or computer.</span>
      </footer>
    </main>
  );
}
