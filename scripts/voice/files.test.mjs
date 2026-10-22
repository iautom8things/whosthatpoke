import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentTag, convert, plan, takeName } from "./files.mjs";

// A fake MP3 of `n` bytes: a frame sync, then a fill byte, so each slice is told apart by its contents.
const mp3 = (n, fill) => Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(n - 2, fill)]);

// Two packs, the way pack.mjs writes them: three whos-that takes and game-over in core, two reveals in reveal-0.
const core = [mp3(30, 1), mp3(20, 2), mp3(25, 3), mp3(10, 4)];
const reveal = [mp3(40, 5), mp3(15, 6)];
const INDEX = {
  v: 1,
  voice: "ash",
  model: "gpt-4o-mini-tts",
  packs: ["core-0.mp3", "reveal-0.mp3"],
  clips: {
    "line.whos-that": [[0, 0, 30, 1900], [0, 30, 20, 1850], [0, 50, 25, 1790]],
    "line.game-over": [[0, 75, 10, 1160]],
    "reveal.25": [[1, 0, 40, 1440]],
    "reveal.130": [[1, 40, 15, 1960]],
  },
};
const SIZES = [85, 55];

describe("takeName", () => {
  it("names a single take after its key and numbers the takes of a multi-take key", () => {
    expect(takeName("reveal.25", 0, 1)).toBe("reveal.25.mp3");
    expect(takeName("line.whos-that", 0, 3)).toBe("line.whos-that.0.mp3");
    expect(takeName("line.whos-that", 2, 3)).toBe("line.whos-that.2.mp3");
  });

  it("ends in the content tag when there is one", () => {
    expect(takeName("reveal.25", 0, 1, "0a1b2c3d")).toBe("reveal.25.0a1b2c3d.mp3");
    expect(takeName("line.whos-that", 2, 3, "0a1b2c3d")).toBe("line.whos-that.2.0a1b2c3d.mp3");
  });
});

describe("plan", () => {
  it("gives every take its own single-clip pack, in key order, keeping voice, model and ms", () => {
    const { files, index } = plan(INDEX, SIZES);
    expect(index).toEqual({
      v: 1,
      voice: "ash",
      model: "gpt-4o-mini-tts",
      packs: ["line.whos-that.0.mp3", "line.whos-that.1.mp3", "line.whos-that.2.mp3", "line.game-over.mp3", "reveal.25.mp3", "reveal.130.mp3"],
      clips: {
        "line.whos-that": [[0, 0, 30, 1900], [1, 0, 20, 1850], [2, 0, 25, 1790]],
        "line.game-over": [[3, 0, 10, 1160]],
        "reveal.25": [[4, 0, 40, 1440]],
        "reveal.130": [[5, 0, 15, 1960]],
      },
    });
    expect(Object.keys(index.clips)).toEqual(Object.keys(INDEX.clips));
    expect(files[2]).toEqual({ name: "line.whos-that.2.mp3", pack: 0, offset: 50, bytes: 25 });
    expect(files[5]).toEqual({ name: "reveal.130.mp3", pack: 1, offset: 40, bytes: 15 });
  });

  it("rejects keys that are not URL-safe file names", () => {
    for (const key of ["reveal/25", ".hidden", "fact..25", "pokémon", "a b"]) {
      expect(() => plan({ ...INDEX, clips: { [key]: [[0, 0, 10, 100]] } }, SIZES)).toThrow(/letters, digits/);
    }
  });

  it("rejects a take outside its pack and two keys that would share a file", () => {
    expect(() => plan({ ...INDEX, clips: { "reveal.1": [[1, 50, 10, 100]] } }, SIZES)).toThrow(/outside reveal-0.mp3/);
    expect(() => plan({ ...INDEX, clips: { "reveal.1": [[2, 0, 10, 100]] } }, SIZES)).toThrow(/outside pack 2/);
    const clash = { "a.b": [[0, 0, 10, 1], [0, 10, 10, 1]], "A.b.0": [[0, 20, 10, 1]] };
    expect(() => plan({ ...INDEX, clips: clash }, SIZES)).toThrow(/a\.b and A\.b\.0/);
  });

  it("rejects an index that is not format v1", () => {
    expect(() => plan({ ...INDEX, v: 2 }, SIZES)).toThrow(/v1/);
  });
});

describe("convert", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("rewrites a packed folder in place, one file per take, and --clean drops the packs", () => {
    dir = mkdtempSync(join(tmpdir(), "voice-files-"));
    writeFileSync(join(dir, "core-0.mp3"), Buffer.concat(core));
    writeFileSync(join(dir, "reveal-0.mp3"), Buffer.concat(reveal));
    writeFileSync(join(dir, "index.json"), JSON.stringify(INDEX));

    expect(convert(dir, dir, { clean: true })).toEqual({ takes: 6, keys: 4, bytes: 140, removed: ["core-0.mp3", "reveal-0.mp3"] });
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
    const packs = [Buffer.concat(core), Buffer.concat(reveal)];
    expect(index).toEqual(plan(INDEX, SIZES, (p, o, n) => contentTag(packs[p].subarray(o, o + n))).index);
    expect(index.packs[0]).toBe(`line.whos-that.0.${contentTag(core[0])}.mp3`);
    expect(readdirSync(dir).sort()).toEqual([...index.packs, "index.json"].sort());
    [...core, ...reveal].forEach((bytes, i) => expect(readFileSync(join(dir, index.packs[i]))).toEqual(bytes));

    // A second run over its own output changes nothing.
    expect(convert(dir, dir, { clean: true }).removed).toEqual([]);
    expect(JSON.parse(readFileSync(join(dir, "index.json"), "utf8"))).toEqual(index);
  });

  it("refuses a slice that does not start on an MP3 frame, before writing anything", () => {
    dir = mkdtempSync(join(tmpdir(), "voice-files-"));
    writeFileSync(join(dir, "core-0.mp3"), Buffer.concat(core));
    writeFileSync(join(dir, "reveal-0.mp3"), Buffer.concat(reveal));
    writeFileSync(join(dir, "index.json"), JSON.stringify({ ...INDEX, clips: { "reveal.25": [[1, 1, 39, 1440]] } }));
    expect(() => convert(dir, dir)).toThrow(/no MP3 frame at byte 1 of reveal-0.mp3/);
    expect(readdirSync(dir).sort()).toEqual(["core-0.mp3", "index.json", "reveal-0.mp3"]);
  });

  it("renames a clip whose bytes change, so a cached copy is never reused", () => {
    dir = mkdtempSync(join(tmpdir(), "voice-files-"));
    const write = (first) => {
      writeFileSync(join(dir, "core-0.mp3"), Buffer.concat([first, ...core.slice(1)]));
      writeFileSync(join(dir, "reveal-0.mp3"), Buffer.concat(reveal));
      writeFileSync(join(dir, "index.json"), JSON.stringify(INDEX));
    };
    const src = mkdtempSync(join(tmpdir(), "voice-src-"));
    try {
      write(core[0]);
      convert(dir, src);
      const before = JSON.parse(readFileSync(join(src, "index.json"), "utf8")).packs;
      write(mp3(30, 9));
      convert(dir, src, { clean: true });
      const after = JSON.parse(readFileSync(join(src, "index.json"), "utf8")).packs;
      expect(after[0]).not.toBe(before[0]);
      expect(after.slice(1)).toEqual(before.slice(1));
      expect(readdirSync(src)).not.toContain(before[0]);
    } finally {
      rmSync(src, { recursive: true, force: true });
    }
  });
});
