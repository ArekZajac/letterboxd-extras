/* The member's watched films, crawled once and shared by the panels that need them.
 *
 * Walked in /films/by/rating/ order rather than the default. That sort is
 * exactly ordered by each film's community weighted average — checked against
 * 65 measured averages, zero inversions across all 2,080 pairs — so a film's
 * index here is its exact community rank, for free. Hot Takes needs that; Eras
 * doesn't care about order. One crawl serves both.
 */

import { cacheKey, cached } from "./cache.js";
import { crawl } from "./net.js";

const FEATURE = "films-index";
const EARLIEST_FILM_YEAR = 1870;

function releaseYear(name, slug, node) {
  const direct = node.getAttribute("data-film-release-year");
  if (direct) return Number(direct);

  const fromName = name.match(/\((\d{4})\)\s*$/);
  if (fromName) return Number(fromName[1]);

  const fromSlug = slug.match(/-(\d{4})$/);
  return fromSlug ? Number(fromSlug[1]) : null;
}

/** The member's own rating, which the tile renders as ★★★★½. */
function ownRating(item) {
  const text = item.textContent || "";
  const rating = (text.match(/★/g) || []).length + (text.includes("½") ? 0.5 : 0);
  return rating > 0 ? rating : null;
}

function extractFilms(doc) {
  const rows = [];

  for (const item of doc.querySelectorAll("li.griditem, li.poster-container")) {
    const node = item.querySelector("[data-item-name], [data-film-name], .film-poster");
    if (!node) continue;

    const name = node.getAttribute("data-item-name") || node.getAttribute("data-film-name") || "";
    const slug = node.getAttribute("data-item-slug") || node.getAttribute("data-film-slug") || "";
    if (!slug) continue;

    rows.push({
      name,
      slug,
      link: node.getAttribute("data-item-link") || `/film/${slug}/`,
      year: releaseYear(name, slug, node),
      rating: ownRating(item),
    });
  }

  return rows;
}

/** Strip the trailing "(2026)" for display. */
export function filmTitle(name) {
  return name.replace(/\s*\(\d{4}\)\s*$/, "").trim() || name;
}

export function isPlausibleYear(year) {
  return !!year && year >= EARLIEST_FILM_YEAR && year <= new Date().getFullYear() + 5;
}

/** Films ordered by community average rating, highest first. */
export async function loadFilms(profile, onProgress, { force = false } = {}) {
  return cached(
    cacheKey(FEATURE, profile.user),
    async () => {
      const base = profile.url("films/by/rating/");
      const { rows, failed, truncated } = await crawl({
        pathFor: (page) => (page === 1 ? base : `${base}page/${page}/`),
        extract: extractFilms,
        onProgress,
      });
      return { films: rows, failed, truncated };
    },
    { force, shouldCache: (data) => !data.failed, validate: (data) => Array.isArray(data.films) }
  );
}
