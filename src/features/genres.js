/* Genres: most-watched genres, under Log History.
 *
 * Genre isn't in the films grid, and no count appears anywhere in the filter
 * UI. But a filtered list can be counted without walking it: page 1 gives both
 * the page size and the page count, so only the last page is needed for the
 * remainder. One request per genre when it fits on a page, two when it doesn't.
 */

import { cacheKey, cached } from "../core/cache.js";
import { actionLink, el, plural, statusLine } from "../core/dom.js";
import { meterList } from "../core/meter.js";
import { countPosters, fetchDoc, lastPageNumber, pooled } from "../core/net.js";
import { panel } from "../core/panel.js";

const COLLAPSED_ROWS = 8;

/** Read the genre slugs off the member's own films page, rather than hardcoding. */
function readGenreLinks(doc) {
  const found = new Map();

  for (const link of doc.querySelectorAll('a[href*="/films/genre/"]')) {
    const href = link.getAttribute("href") || "";
    const slug = (href.split("/genre/")[1] || "").replace(/\/$/, "");
    const name = link.textContent.trim();
    if (!slug || !name || found.has(slug)) continue;
    found.set(slug, { slug, name, path: href.endsWith("/") ? href : `${href}/` });
  }

  return [...found.values()];
}

/** @param {Document} [first] an already-fetched page 1, to save a round trip */
async function countFilms(path, first) {
  const firstPage = first ?? (await fetchDoc(path));
  const pages = lastPageNumber(firstPage);
  const onFirstPage = countPosters(firstPage);

  if (pages <= 1) return onFirstPage;

  // Page 1 is full whenever there's more than one, so it *is* the page size.
  const lastPage = await fetchDoc(`${path}page/${pages}/`);
  return (pages - 1) * onFirstPage + countPosters(lastPage);
}

async function load(profile, onProgress, { force = false } = {}) {
  return cached(
    cacheKey("genres", profile.user),
    async () => {
      const filmsPath = profile.url("films/");
      const index = await fetchDoc(filmsPath);

      const genres = readGenreLinks(index);
      const watched = await countFilms(filmsPath, index);

      const { results, failed } = await pooled({
        items: genres,
        work: async (genre) => ({ ...genre, count: await countFilms(genre.path) }),
        onProgress,
      });

      results.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return { genres: results, watched, failed };
    },
    { force, shouldCache: (data) => !data.failed, validate: (data) => Array.isArray(data.genres) }
  );
}

function render({ body, accessories, data }) {
  body.textContent = "";
  accessories.textContent = "";

  const genres = data.genres.filter((genre) => genre.count > 0);
  if (!genres.length) {
    statusLine(body, "No genres to chart yet.");
    return;
  }

  const peak = genres[0].count;
  // Measured across every genre, not the visible ones, so nothing shifts on toggle.
  const valueWidth = Math.max(...genres.map((genre) => genre.count.toLocaleString().length));

  const slot = el("div", "lbx-genre-slot");
  body.appendChild(slot);

  let expanded = false;
  const toggle =
    genres.length > COLLAPSED_ROWS
      ? actionLink("Show all", () => {
          expanded = !expanded;
          draw();
        })
      : null;
  if (toggle) accessories.appendChild(toggle);

  if (data.failed) {
    body.appendChild(
      el("p", "lbx-status -warning", `Partial data: ${plural(data.failed, "genre", "genres")} unavailable.`)
    );
  }

  function draw() {
    if (toggle) toggle.textContent = expanded ? `Show top ${COLLAPSED_ROWS}` : "Show all";
    const shown = expanded ? genres : genres.slice(0, COLLAPSED_ROWS);

    slot.replaceChildren(
      meterList({
        peak,
        valueWidth,
        rows: shown.map((genre) => ({
          label: genre.name,
          value: genre.count,
          text: genre.count.toLocaleString(),
          href: genre.path,
          // Films carry several genres each, so these sum to more than the
          // total watched; the share makes that legible.
          tooltip: data.watched
            ? `${plural(genre.count, "film", "films")} · ${Math.round((genre.count / data.watched) * 100)}% of films watched`
            : plural(genre.count, "film", "films"),
        })),
      })
    );
  }

  draw();
}

export default panel({
  id: "lbx-genres",
  className: "lbx-genres",
  heading: "Genres",
  href: (profile) => profile.url("films/"),
  anchor: () => document.getElementById("lbx-log-history") ?? document.querySelector("#recent-activity"),
  loading: (progress) =>
    progress ? `Reading genres… ${progress.done} of ${progress.total}` : "Reading genres…",
  error: "Couldn't read the genre breakdown.",
  load,
  render,
});
