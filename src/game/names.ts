// A light check on names that go up on the projector. It catches the usual rude words, spelled
// with spaces, repeated letters or digits for letters ("f u u c k", "sh1t"); it is not a full filter.

/** Rude anywhere inside a word, once repeated letters are collapsed. */
const ANYWHERE = [
  "fuck", "phuck", "bitch", "biatch", "cunt", "whore", "slut", "penis", "vagina", "porn", "dildo",
  "nigger", "nigga", "faggot", "asshole", "butthole", "bastard", "wanker", "retard", "rapist", "molest",
  "hitler", "jizz", "dumbass", "jackass", "killyourself", "mierda", "pendejo", "chinga", "motherf",
  "dickhead", "dickface", "dicksuck", "cocksuck",
];

/**
 * "shit" inside a word unless a vowel follows: "bullshit" and "shitty" are rude, while Matsushita,
 * Shitara and Shiitake are real names. On its own it is a whole word below.
 */
const SHIT_INSIDE = /shit(?![aeiou])/;

/** Rude as a whole word (or the whole name). Too short to look for inside other names: "Cassidy", "Titan". */
const WHOLE_WORD = [
  "ass", "arse", "shit", "fuk", "fck", "fk", "sht", "btch", "dick", "cock", "pussy", "tit", "tits", "titty", "boob",
  "boobs", "cum", "sex", "sexy", "anal", "anus", "rape", "fag", "nazi", "kkk", "milf", "horny", "nude",
  "twat", "wtf", "stfu", "puta", "verga", "culo", "kys",
];

const LEET: Record<string, string> = { "0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i" };

const collapse = (s: string) => s.replace(/(.)\1+/g, "$1");

/** Lowercase ASCII letters, digits and look-alike symbols spelled out, with 1 read as `one`. */
function spellings(name: string): string[] {
  const base = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[034578@$!]/g, (c) => LEET[c]);
  return [base.replace(/1/g, "i"), base.replace(/1/g, "l")];
}

const anywhere = ANYWHERE.map(collapse);
const whole = new Set(WHOLE_WORD);
const wholeCollapsed = new Map(WHOLE_WORD.map((w) => [collapse(w), w.length]));

/** A whole word matches its spelling, or its spelling with letters stretched ("asss"). */
const wordHit = (word: string) =>
  whole.has(word) || (wholeCollapsed.get(collapse(word)) ?? Infinity) <= word.length;

const insideWord = (word: string) => {
  const squeezed = collapse(word);
  return wordHit(word) || SHIT_INSIDE.test(squeezed) || anywhere.some((w) => squeezed.includes(w));
};

/**
 * Words run together ("F U C K", "Big Butt Hole") only count when they spell a rude word exactly,
 * so "Wes Hitley" and "Bob Itchy" pass.
 */
const spelledAcross = (words: readonly string[]) => {
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 2; j <= words.length; j++) {
      const joined = words.slice(i, j).join("");
      if (wordHit(joined) || anywhere.includes(collapse(joined))) return true;
    }
  }
  return false;
};

/** True when a name should not go on the board. */
export function isBlockedName(name: string): boolean {
  return spellings(name).some((spelled) => {
    const words = spelled.split(/[^a-z]+/).filter(Boolean);
    return words.some(insideWord) || spelledAcross(words);
  });
}

/** The name, or `fallback` when it is blocked. */
export function safeName(name: string, fallback = "Trainer"): string {
  return isBlockedName(name) ? fallback : name;
}
