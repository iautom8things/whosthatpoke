// Geometry for QrCode.tsx, in module units. qrShape.test.ts checks the center hole; QrCode.test.ts decodes the drawn SVG.

/** Light margin on every side, in modules. Scanners need 4. */
export const QUIET = 4;
/** A finder eye: the 7x7 squares in three corners. */
const EYE = 7;
/** The square left clear in the middle for the Poké Ball. Error correction Q rebuilds what it covers. */
const HOLE = 7;
/**
 * Corner radius of a module, as a fraction of its side. Full dots (0.5) cost ZXing a quarter of its reads of a blurry,
 * washed-out projector photo; 0.3 reads as often as plain squares and still looks soft.
 */
const CORNER = 0.3;

export interface QrShape {
  /** Modules per side, without the quiet zone. */
  size: number;
  /** Every data module as one path. A corner with no dark neighbor on either side is rounded. */
  modules: string;
  /** Top-left corner of each finder eye. */
  eyes: [number, number][];
  /** The cleared center square: first module on each axis, and its width. */
  hole: { at: number; size: number };
}

/** True for the data modules that get drawn: dark, and outside the finder eyes and the center hole. */
export function dotModules(rows: readonly string[]): boolean[][] {
  const size = rows.length;
  const at = (size - HOLE) / 2;
  const inEye = (x: number, y: number) => {
    const left = x < EYE, right = x >= size - EYE, top = y < EYE, bottom = y >= size - EYE;
    return (top && (left || right)) || (bottom && left);
  };
  const inHole = (x: number, y: number) => x >= at && x < at + HOLE && y >= at && y < at + HOLE;
  return rows.map((row, y) => [...row].map((c, x) => c === "1" && !inEye(x, y) && !inHole(x, y)));
}

export function qrShape(rows: readonly string[]): QrShape {
  const size = rows.length;
  const dots = dotModules(rows);
  const dark = (x: number, y: number) => dots[y]?.[x] === true;
  const r = CORNER;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!dark(x, y)) continue;
      const n = dark(x, y - 1), e = dark(x + 1, y), s = dark(x, y + 1), w = dark(x - 1, y);
      const tl = n || w ? 0 : r, tr = n || e ? 0 : r, br = s || e ? 0 : r, bl = s || w ? 0 : r;
      const arc = (k: number, tx: number, ty: number) => (k ? `A${k} ${k} 0 0 1 ${tx} ${ty}` : "");
      d +=
        `M${x + tl} ${y}H${x + 1 - tr}${arc(tr, x + 1, y + tr)}` +
        `V${y + 1 - br}${arc(br, x + 1 - br, y + 1)}` +
        `H${x + bl}${arc(bl, x, y + 1 - bl)}` +
        `V${y + tl}${arc(tl, x + tl, y)}Z`;
    }
  }
  return {
    size,
    modules: d,
    eyes: [
      [0, 0],
      [size - EYE, 0],
      [0, size - EYE],
    ],
    hole: { at: (size - HOLE) / 2, size: HOLE },
  };
}
