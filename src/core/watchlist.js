/* Watchlists, read for the film picker.
 *
 * Genre and decade go in the URL, so the server filters and a crawl is only as
 * big as its answer. Runtime is on no list page, but /by/shortest/ sorts by it
 * (runtime-less films last), so "at most N minutes" is the front of that list:
 * a binary search finds where it ends, reading /film/<slug>/json/ once per
 * probe rather than once per film.
 */

import { cacheKey, cached } from "./cache.js";
import { firstIndexWhere } from "./draw.js";
import { extractFilms } from "./films.js";
import { crawl, fetchDoc, fetchText, lastPageNumber, pooled, walk } from "./net.js";
import { posterFor } from "./poster.js";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000; // runtimes and posters barely change

export const filterPath = ({ genre, decade }) =>
  `${genre ? `genre/${genre}/` : ""}${decade ? `decade/${decade}/` : ""}`;

/** Anyone's watchlist, in the shape resolveWatchlist() gives the one on screen. */
export const watchlistOf = (user) => ({
  user,
  own: false,
  size: null,
  url: (sub = "") => `/${user}/watchlist/${sub}`,
});

/**
 * The signed-in member's own list is read with their cookie: it's the only way
 * to see it once it's private, and their account filters (hide short films,
 * documentaries, …) are a fair say in what gets suggested. The same list read
 * from someone else's page is a different answer, hence its own cache key.
 */
const credentialsFor = (list) => (list.own ? "same-origin" : "omit");
const keyFor = (feature, list, filters) =>
  cacheKey(`${feature}${list.own ? ":own" : ""}:${filterPath(filters)}`, list.user);

const pageOf = (base, page) => (page === 1 ? base : `${base}page/${page}/`);

/** Newest addition first, as Letterboxd sorts a watchlist by default. */
export async function loadWatchlist(list, filters, onProgress, { force = false } = {}) {
  return cached(
    keyFor("watchlist", list, filters),
    async () => {
      const { rows, failed, truncated } = await crawl({
        pathFor: (page) => pageOf(list.url(filterPath(filters)), page),
        extract: extractFilms,
        onProgress,
        credentials: credentialsFor(list),
      });
      return { films: rows, failed, truncated, size: list.size };
    },
    {
      force,
      shouldCache: (data) => !data.failed,
      // A different count in the page header means a film came or went.
      validate: (data) => Array.isArray(data.films) && data.size === list.size,
    }
  );
}

/** The films at most `minutes` long, as {slug}. */
export async function loadShorterThan(list, filters, minutes, onProgress, { force = false } = {}) {
  return cached(
    keyFor(`upto-${minutes}`, list, filters),
    async () => {
      const base = list.url(`${filterPath(filters)}by/shortest/`);
      const credentials = credentialsFor(list);

      const first = await fetchDoc(base, { credentials });
      const pageSize = extractFilms(first).length;
      if (!pageSize) return { films: [], failed: 0, size: list.size };

      const pages = new Map([[1, Promise.resolve(extractFilms(first))]]);
      const page = (n) => {
        if (!pages.has(n)) pages.set(n, fetchDoc(pageOf(base, n), { credentials }).then(extractFilms));
        return pages.get(n);
      };

      onProgress({ phase: "search" });
      // Indices past the last film read as undefined, which counts as too long.
      const cutoff = await firstIndexWhere(lastPageNumber(first) * pageSize, async (index) => {
        const film = (await page(Math.floor(index / pageSize) + 1))[index % pageSize];
        if (!film) return true;
        const { runtime } = await filmFacts(film);
        return runtime == null || runtime > minutes;
      });

      const needed = Array.from({ length: Math.ceil(cutoff / pageSize) }, (_, i) => i + 1);
      const { failed } = await pooled({
        items: needed.filter((n) => n > 1),
        work: page,
        onProgress: ({ done, total }) => onProgress({ phase: "pages", done, total }),
      });

      // By position rather than concatenation, so a page that failed can't
      // shift the next page's longer films under the cutoff.
      const films = [];
      for (const n of needed) {
        const rows = await page(n).catch(() => []);
        rows.forEach((film, i) => {
          if ((n - 1) * pageSize + i < cutoff) films.push({ slug: film.slug });
        });
      }

      return { films, failed, size: list.size };
    },
    {
      force,
      shouldCache: (data) => !data.failed,
      validate: (data) => Array.isArray(data.films) && data.size === list.size,
    }
  );
}

/** Runtime, year and directors from /film/<slug>/json/, about 500 bytes. */
export function filmFacts(film) {
  return cached(
    cacheKey("film", film.slug),
    async () => {
      const json = JSON.parse(await fetchText(`/film/${film.slug}/json/`));
      return {
        runtime: json.runTime || null,
        year: json.releaseYear || null,
        directors: (json.directors || []).map((director) => director.name),
      };
    },
    { ttl: THIRTY_DAYS, validate: (data) => "runtime" in data }
  );
}

export function filmPoster(film, width) {
  return cached(cacheKey(`poster-${width}`, film.slug), () => posterFor(film.link || `/film/${film.slug}/`, width), {
    ttl: THIRTY_DAYS,
    validate: (data) => "url" in data,
  });
}

function extractPeople(doc) {
  const people = new Map();
  for (const link of doc.querySelectorAll("a.name[href]")) {
    const user = link.getAttribute("href").split("/")[1];
    if (user && !people.has(user)) people.set(user, { user, name: link.textContent.trim() || user });
  }
  return [...people.values()];
}

/** Everyone `user` follows: what Letterboxd itself means by their friends. */
export function loadFollowing(user, { force = false } = {}) {
  return cached(
    cacheKey("following", user),
    async () => {
      const { rows, truncated } = await walk({ path: `/${user}/following/`, extract: extractPeople });
      return { people: rows, truncated };
    },
    { force, validate: (data) => Array.isArray(data.people) }
  );
}
