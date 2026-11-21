// A small seeded random number generator (mulberry32): the same seed gives the
// same city, traffic and missions, which is what makes the screenshot scenes
// repeatable. Every helper draws from the same stream, so call order matters —
// never draw from the stream for a cosmetic choice ahead of a structural one.

export function createRandom(seed) {
  let a = seed | 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  next.range = (min, max) => min + next() * (max - min);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  // Fisher-Yates, in place, drawing from the same stream.
  next.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  };
  // Pick an entry of [[value, weight], ...] by its weight.
  next.weighted = (pairs) => {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let roll = next() * total;
    for (const [value, w] of pairs) {
      roll -= w;
      if (roll <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  };
  return next;
}
