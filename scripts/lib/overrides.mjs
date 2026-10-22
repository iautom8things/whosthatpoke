// Difficulty tiers by rank, and the hand overrides that move species between them.

export const TIERS = [
  { tier: 1, label: "easy", from: 1, to: 120 },
  { tier: 2, label: "medium", from: 121, to: 350 },
  { tier: 3, label: "hard", from: 351, to: 650 },
  { tier: 4, label: "master", from: 651, to: 1025 },
];

export const tierOfRank = (rank) => TIERS.find((t) => rank >= t.from && rank <= t.to).tier;

// overrides: { "<dex>": { rank?, tier?, reason } }; order: species best first.
// A rank override takes exactly that rank, and rank wins when both are given.
// A tier override puts the species in that tier; when it is already there, the
// override pins it so it cannot roll into a neighbour as others leave. Tiers keep
// their sizes: the slots a tier has left after rank overrides go to the species
// overridden into it, then to the other species in base order, and the tier's
// members fill those slots in base order.
export function applyOverrides(order, overrides) {
  const baseIndex = new Map(order.map((s, i) => [s.dex, i]));
  const atRank = new Map();
  const intoTier = new Map(TIERS.map((t) => [t.tier, []]));
  for (const [key, o] of Object.entries(overrides)) {
    const species = order[baseIndex.get(Number(key))];
    if (!species) throw new Error(`override for unknown dex ${key}`);
    if (!o.reason) throw new Error(`override for ${key} needs a reason`);
    if (o.rank != null) {
      if (!Number.isInteger(o.rank) || o.rank < 1 || o.rank > order.length) throw new Error(`override for ${key} has invalid rank ${o.rank}`);
      if (atRank.has(o.rank)) throw new Error(`overrides for ${atRank.get(o.rank).dex} and ${key} both take rank ${o.rank}`);
      atRank.set(o.rank, species);
    } else if (o.tier != null) {
      if (!intoTier.has(o.tier)) throw new Error(`override for ${key} has unknown tier ${o.tier}`);
      intoTier.get(o.tier).push(species);
    } else throw new Error(`override for ${key} needs a rank or a tier`);
  }

  const overridden = new Set(Object.keys(overrides).map(Number));
  const rest = order.filter((s) => !overridden.has(s.dex));
  const out = [];
  for (const t of TIERS) {
    const open = [];
    for (let rank = t.from; rank <= t.to; rank++) if (!atRank.has(rank)) open.push(rank);
    const forced = intoTier.get(t.tier);
    if (forced.length > open.length) throw new Error(`tier ${t.tier} has ${open.length} open slots for ${forced.length} overrides`);
    const members = [...forced, ...rest.splice(0, open.length - forced.length)];
    members.sort((a, b) => baseIndex.get(a.dex) - baseIndex.get(b.dex));
    open.forEach((rank, i) => (out[rank - 1] = members[i]));
  }
  for (const [rank, species] of atRank) out[rank - 1] = species;
  return out;
}
