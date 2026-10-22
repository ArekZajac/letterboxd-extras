/* Hot Takes: the films rated furthest from the crowd.
 *
 * Their own rating is free (it's in the films index). The community average
 * isn't on any list page, but it doesn't need the 330 KB film page either:
 * /csi/film/<slug>/rating-histogram/ is 5.7 KB and carries "Weighted average of
 * 4.52 based on 5,826,510 ratings". Still one request per film, hence the
 * shortlist for big accounts — see pickCandidates().
 *
 * Two rows rather than one ranked list: community averages cluster around 3-4
 * and the scale floors at 0.5, so there's far more room to fall below an
 * average than to rise above it. Merged, the panel would be nothing but films
 * the member disliked.
 *
 * The caption's .rating.rated-N draws the stars from the site sprite (N is the
 * rating doubled).
 */

import { cacheKey, cached } from "../core/cache.js";
import { el, plural, statusLine } from "../core/dom.js";
import { filmTitle, loadFilms } from "../core/films.js";
import { fetchText, pooled } from "../core/net.js";
import { panel } from "../core/panel.js";
import { posterFor, posterGrid, posterTile } from "../core/poster.js";

const PER_SIDE = 4; // one row of the four-across poster grid
const POSTER_WIDTH = 150; // matches .grid.-p150
const MIN_COMMUNITY_RATINGS = 1000; // below this an average is noise
const MEASURE_ALL_UPTO = 200; // rated films we'll just measure outright
const SHORTLIST_PER_SIDE = 25; // candidates measured per side above that

async function communityRating(slug) {
  const html = await fetchText(`/csi/film/${slug}/rating-histogram/`);
  const average = html.match(/[Ww]eighted average of ([\d.]+)/);
  const count = html.match(/based on ([\d,]+)/);
  if (!average) return { average: null, ratings: 0 }; // too few ratings to have one
  return {
    average: Number(average[1]),
    ratings: count ? Number(count[1].replace(/,/g, "")) : 0,
  };
}

/**
 * Under MEASURE_ALL_UPTO every rated film is measured, so the result is exact.
 * Above it, films arrive sorted by community average, so a film's index is its
 * exact community rank even without the value. Scoring that rank against the
 * member's own rating picks out the likely extremes: a heuristic that can miss
 * a borderline entry, but the difference between ~50 requests and one per film.
 */
function pickCandidates(rated) {
  if (rated.length <= MEASURE_ALL_UPTO) return rated;

  const last = Math.max(1, rated.length - 1);
  const scored = rated.map((film, index) => ({
    film,
    community: 1 - index / last, // 1 = highest community average
    own: (film.rating - 0.5) / 4.5, // 1 = they gave it five stars
  }));

  const byGap = (a, b) => b.gap - a.gap;
  const colder = scored.map((s) => ({ ...s, gap: s.community - s.own })).sort(byGap);
  const hotter = scored.map((s) => ({ ...s, gap: s.own - s.community })).sort(byGap);

  const picked = new Map();
  for (const list of [colder, hotter]) {
    for (const entry of list.slice(0, SHORTLIST_PER_SIDE)) picked.set(entry.film.slug, entry.film);
  }
  return [...picked.values()];
}

async function load(profile, onProgress, { force = false } = {}) {
  return cached(
    cacheKey("hot-takes", profile.user),
    async () => {
      const index = await loadFilms(
        profile,
        ({ done, total }) => onProgress({ phase: "films", done, total }),
        { force }
      );

      const rated = index.films.filter((film) => film.rating != null);
      const candidates = pickCandidates(rated);

      const { results, failed } = await pooled({
        items: candidates,
        work: async (film) => ({ ...film, ...(await communityRating(film.slug)) }),
        onProgress: ({ done, total }) => onProgress({ phase: "ratings", done, total }),
      });

      const takes = results
        .filter((film) => film.average != null && film.ratings >= MIN_COMMUNITY_RATINGS)
        .map((film) => ({ ...film, gap: Number((film.rating - film.average).toFixed(2)) }));

      const hotter = takes.filter((t) => t.gap > 0).sort((a, b) => b.gap - a.gap);
      const colder = takes.filter((t) => t.gap < 0).sort((a, b) => a.gap - b.gap);

      // Posters only for the eight that end up on screen.
      const shown = [...hotter.slice(0, PER_SIDE), ...colder.slice(0, PER_SIDE)];
      const { results: posters } = await pooled({
        items: shown,
        work: async (film) => [film.slug, await posterFor(film.link || `/film/${film.slug}/`, POSTER_WIDTH)],
        onProgress: ({ done, total }) => onProgress({ phase: "posters", done, total }),
      });

      const bySlug = new Map(posters);
      const attach = (list) => list.map((f) => ({ ...f, poster: bySlug.get(f.slug) ?? null }));

      return {
        hotter: attach(hotter.slice(0, PER_SIDE)),
        colder: attach(colder.slice(0, PER_SIDE)),
        measured: candidates.length,
        rated: rated.length,
        exact: rated.length <= MEASURE_ALL_UPTO,
        failed: failed + index.failed,
      };
    },
    {
      force,
      shouldCache: (data) => !data.failed,
      validate: (data) => Array.isArray(data.hotter) && Array.isArray(data.colder),
    }
  );
}

/** Letterboxd's star sprite: rated-1 to rated-10. */
function stars(rating) {
  const text = "★".repeat(Math.floor(rating)) + (rating % 1 ? "½" : "");
  return el("span", `rating rated-${Math.round(rating * 2)}`, text);
}

function tile(take, profile) {
  // Two decimals: one rounds 1.04 and 0.96 to the same "+1.0".
  const gap = el(
    "span",
    `lbx-deviation ${take.gap > 0 ? "-hotter" : "-colder"}`,
    `${take.gap > 0 ? "+" : "−"}${Math.abs(take.gap).toFixed(2)}`
  );

  return posterTile({
    name: take.name,
    alt: filmTitle(take.name),
    href: profile.url(`film/${take.slug}/`),
    poster: take.poster,
    width: POSTER_WIDTH,
    tooltip: `You ${take.rating} · crowd ${take.average.toFixed(2)} from ${plural(take.ratings, "rating", "ratings")}`,
    caption: [stars(take.rating), gap],
  });
}

function posterRow({ takes, heading, profile }) {
  const row = el("div", "lbx-take-row");
  row.appendChild(el("h3", "lbx-take-heading", heading));

  if (!takes.length) {
    row.appendChild(el("p", "lbx-status", "Nothing here yet."));
    return row;
  }

  row.appendChild(posterGrid(takes.map((take) => tile(take, profile)), POSTER_WIDTH));
  return row;
}

function render({ body, data, profile }) {
  body.textContent = "";

  if (!data.hotter.length && !data.colder.length) {
    statusLine(body, "Not enough rated films to compare yet.");
    return;
  }

  body.append(
    posterRow({ takes: data.hotter, heading: "Hotter than the crowd", profile }),
    posterRow({ takes: data.colder, heading: "Colder than the crowd", profile })
  );

  const notes = [];
  if (!data.exact) {
    notes.push(`measured the ${data.measured} likeliest extremes of ${data.rated} rated films`);
  }
  if (data.failed) notes.push(`${plural(data.failed, "lookup", "lookups")} unavailable`);
  if (notes.length) body.appendChild(el("p", "lbx-status -warning", `${notes.join(" · ")}.`));
}

const PROGRESS = {
  films: ({ done, total }) => `Reading watched films… ${done} of ${total}`,
  ratings: ({ done, total }) => `Comparing with the crowd… ${done} of ${total}`,
  posters: () => "Fetching posters…",
};

export default panel({
  id: "lbx-hot-takes",
  className: "lbx-hot-takes",
  heading: "Hot Takes",
  href: (profile) => profile.url("films/by/entry-rating/"),
  anchor: () =>
    document.getElementById("lbx-genres") ??
    document.getElementById("lbx-log-history") ??
    document.querySelector("#recent-activity"),
  loading: (progress) => (progress ? PROGRESS[progress.phase](progress) : "Reading ratings…"),
  error: "Couldn't compare your ratings.",
  load,
  render,
});
