type Say = (text: string) => Promise<void>;

export interface ReadOutOptions {
  /** The "Who's that Pokémon?" line, for a replay. */
  line: string;
  /** The four names, read after the line on Poké Ball. Null on the other balls. */
  names: string | null;
  say: Say;
  /** True while the read-out must not go on: the Quit dialog is open, or the question was answered or left. */
  cut: () => boolean;
}

/**
 * One question read out loud: the line, then on Poké Ball the names. A part the Quit dialog cut off counts as
 * unheard, and resume() reads it again after Keep playing.
 */
export class ReadOut {
  private heardLine = false;
  private heardNames = false;

  constructor(private readonly opts: ReadOutOptions) {}

  /** Goes on from `line`, the line already queued with its sting. Resolves when the read-out ends or is cut. */
  start(line: Promise<void>): Promise<void> {
    const { names, say, cut } = this.opts;
    return line.then(() => {
      if (cut()) return;
      this.heardLine = true;
      if (!names) return;
      return say(names).then(() => {
        if (!cut()) this.heardNames = true;
      });
    });
  }

  /** Reads again what the dialog cut off. Null when there is nothing to read or the question is over. */
  resume(): Promise<void> | null {
    const { line, names, say, cut } = this.opts;
    if (cut() || (this.heardLine && (this.heardNames || !names))) return null;
    return this.start(this.heardLine ? Promise.resolve() : say(line));
  }
}
