import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { drawFresh, firstIndexWhere, onBoth, weightedIndex, weightedSample } from "../src/core/draw.js";

/** Seeded, so a distribution test can't flake. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const films = (...slugs) => slugs.map((slug) => ({ slug }));
const slugsOf = (list) => list.map((film) => film.slug);

describe("weightedIndex", () => {
  it("maps the unit interval onto cumulative weights", () => {
    assert.equal(weightedIndex([1, 0, 3], () => 0), 0);
    assert.equal(weightedIndex([1, 0, 3], () => 0.2), 0);
    assert.equal(weightedIndex([1, 0, 3], () => 0.5), 2);
    assert.equal(weightedIndex([1, 0, 3], () => 0.999999), 2);
  });

  it("never lands on a zero weight", () => {
    assert.equal(weightedIndex([0, 0, 5], () => 0), 2);
    assert.equal(weightedIndex([2, 0], () => 0.999999), 0);
  });
});

describe("weightedSample", () => {
  it("returns distinct items, at most as many as there are", () => {
    const picked = weightedSample(films("a", "b", "c", "d"), () => 1, 3, mulberry32(1));
    assert.equal(new Set(slugsOf(picked)).size, 3);
    assert.equal(weightedSample(films("a", "b"), () => 1, 3, mulberry32(1)).length, 2);
  });

  it("draws in proportion to weight", () => {
    const random = mulberry32(42);
    const weights = { a: 1, b: 3 };
    let b = 0;
    const runs = 20000;
    for (let i = 0; i < runs; i++) {
      const [first] = weightedSample(films("a", "b"), (film) => weights[film.slug], 1, random);
      if (first.slug === "b") b += 1;
    }
    assert.ok(Math.abs(b / runs - 0.75) < 0.01, `b drawn ${b} of ${runs}`);
  });
});

describe("drawFresh", () => {
  it("leans to the oldest addition: the pool is newest first", () => {
    const random = mulberry32(7);
    const counts = { new: 0, old: 0 };
    for (let i = 0; i < 20000; i++) {
      const { picks } = drawFresh(films("new", "old"), { count: 1, seen: new Set(), random });
      counts[picks[0].slug] += 1;
    }
    // Weights 1 and 2.
    assert.ok(Math.abs(counts.old / 20000 - 2 / 3) < 0.01, JSON.stringify(counts));
  });

  it("shows every film once before repeating any", () => {
    const pool = films("a", "b", "c", "d", "e", "f");
    const random = mulberry32(3);
    let seen = new Set();
    const shown = [];
    for (let round = 0; round < 2; round++) {
      const result = drawFresh(pool, { count: 3, seen, random });
      seen = result.seen;
      shown.push(...slugsOf(result.picks));
    }
    assert.deepEqual([...shown].sort(), ["a", "b", "c", "d", "e", "f"]);
  });

  it("starts over without repeating the three on screen", () => {
    const pool = films("a", "b", "c", "d", "e");
    const current = films("c", "d", "e");
    const seen = new Set(["a", "b", "c", "d", "e"]);
    for (let seed = 0; seed < 50; seed++) {
      const { picks, seen: next } = drawFresh(pool, { count: 3, seen, current, random: mulberry32(seed) });
      const fresh = slugsOf(picks).filter((slug) => !["c", "d", "e"].includes(slug));
      assert.deepEqual(fresh.sort(), ["a", "b"]);
      assert.equal(picks.length, 3);
      assert.ok(slugsOf(picks).every((slug) => next.has(slug)));
    }
  });

  it("returns the whole pool when it is no bigger than the count", () => {
    const { picks } = drawFresh(films("a", "b"), { count: 3, seen: new Set(["a"]), random: mulberry32(1) });
    assert.deepEqual(slugsOf(picks).sort(), ["a", "b"]);
    assert.deepEqual(drawFresh([], { count: 3, seen: new Set() }).picks, []);
  });
});

describe("firstIndexWhere", () => {
  const over90 = (runtimes) => async (i) => (runtimes[i] ?? Infinity) > 90;

  it("finds the first index past the cutoff", async () => {
    assert.equal(await firstIndexWhere(5, over90([3, 8, 90, 91, 120])), 3);
    assert.equal(await firstIndexWhere(3, over90([91, 100, 200])), 0);
    assert.equal(await firstIndexWhere(3, over90([10, 20, 90])), 3);
    assert.equal(await firstIndexWhere(0, over90([])), 0);
  });

  it("treats a missing runtime as past every cutoff", async () => {
    assert.equal(await firstIndexWhere(4, over90([80, 85, null, null])), 2);
  });

  it("probes logarithmically", async () => {
    const runtimes = Array.from({ length: 1000 }, (_, i) => i);
    let probes = 0;
    const found = await firstIndexWhere(1000, async (i) => {
      probes += 1;
      return runtimes[i] > 90;
    });
    assert.equal(found, 91);
    assert.ok(probes <= 10, `${probes} probes`);
  });
});

describe("onBoth", () => {
  it("keeps the first list's order and drops what the second lacks", () => {
    assert.deepEqual(slugsOf(onBoth(films("c", "a", "b"), films("b", "c", "z"))), ["c", "b"]);
  });
});
