/* Choosing films: pure functions, kept free of the DOM and the network so
   `node --test` can reach them. */

/** Index into `weights`, chosen in proportion to them. Zero weights never win. */
export function weightedIndex(weights, random = Math.random) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;

  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    if (target < weights[i]) return i;
    target -= weights[i];
  }

  // Float error can leave the target a hair past the end.
  return weights.findLastIndex((weight) => weight > 0);
}

/** Up to `count` distinct items, each draw in proportion to `weightOf`. */
export function weightedSample(items, weightOf, count, random = Math.random) {
  const remaining = [...items];
  const weights = remaining.map(weightOf);
  const picked = [];

  while (picked.length < count && remaining.length) {
    const index = weightedIndex(weights, random);
    if (index < 0) break;
    picked.push(remaining[index]);
    remaining.splice(index, 1);
    weights.splice(index, 1);
  }

  return picked;
}

/**
 * Draw `count` films, leaning towards the ones on the watchlist longest, and
 * show every film once before any comes round again.
 *
 * The pool arrives newest first, as Letterboxd sorts a watchlist by default,
 * so a film's weight is its position: the newest addition 1, the oldest N.
 * When the unseen films run out, the round starts over, avoiding the films
 * on screen (`current`) for as long as there are others to show.
 *
 * @returns {{picks: object[], seen: Set<string>}} the slugs shown this round
 */
export function drawFresh(pool, { count = 3, seen, current = [], random = Math.random }) {
  const age = new Map(pool.map((film, index) => [film.slug, index + 1]));
  const weightOf = (film) => age.get(film.slug);
  const unseen = pool.filter((film) => !seen.has(film.slug));

  if (unseen.length >= count) {
    const picks = weightedSample(unseen, weightOf, count, random);
    return { picks, seen: new Set([...seen, ...picks.map((film) => film.slug)]) };
  }

  const onScreen = new Set(current.map((film) => film.slug));
  const leftover = new Set(unseen.map((film) => film.slug));
  const offScreen = pool.filter((film) => !leftover.has(film.slug) && !onScreen.has(film.slug));
  const repeats = pool.filter((film) => !leftover.has(film.slug) && onScreen.has(film.slug));

  const picks = [...unseen];
  for (const tier of [offScreen, repeats]) {
    picks.push(...weightedSample(tier, weightOf, count - picks.length, random));
  }

  return { picks, seen: new Set(picks.map((film) => film.slug)) };
}

/** Lowest index in [0, length) where `predicate` turns true, or `length`. The predicate must be monotone. */
export async function firstIndexWhere(length, predicate) {
  let low = 0;
  let high = length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (await predicate(mid)) high = mid;
    else low = mid + 1;
  }

  return low;
}

/** Films in `mine` that are also in `theirs`, in `mine`'s order. */
export function onBoth(mine, theirs) {
  const slugs = new Set(theirs.map((film) => film.slug));
  return mine.filter((film) => slugs.has(film.slug));
}
