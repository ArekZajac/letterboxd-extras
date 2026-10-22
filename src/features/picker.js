/* Pick a film: three suggestions from a watchlist, at /{user}/watchlist/#pick.
 *
 * It lives on the watchlist page rather than an extension page so it keeps
 * Letterboxd's own header and stylesheet. While the hash is #pick the main
 * column's filter bar and grid are hidden (early.js sets the class before
 * first paint) and this section stands in for them; Back brings them back.
 *
 * Every input is a hard filter. Genre and decade go to the server in the URL,
 * runtime comes from the front of /by/shortest/, and a friend's watchlist is
 * crawled and intersected here. Not through Letterboxd's own "Show films in
 * watchlist": that is a cookie, and it would filter every grid on the site.
 */

import { actionLink, buildSection, el, errorLine, plural, statusLine } from "../core/dom.js";
import { drawFresh, onBoth } from "../core/draw.js";
import { filmTitle } from "../core/films.js";
import { posterGrid, posterTile } from "../core/poster.js";
import {
  filmFacts,
  filmPoster,
  loadFollowing,
  loadShorterThan,
  loadWatchlist,
  watchlistOf,
} from "../core/watchlist.js";

const HASH = "#pick";
const PICKS = 3;
const POSTER_WIDTH = 230;
const LENGTHS = [
  ["", "Any length"],
  ["90", "Up to 90 mins"],
  ["120", "Up to 2 hours"],
  ["150", "Up to 2½ hours"],
];

/** Genre or decade slugs, read off the page's own filter menu rather than hardcoded. */
function menuOptions(kind) {
  const found = new Map();
  for (const link of document.querySelectorAll(`a[href*="/watchlist/"][href*="/${kind}/"]`)) {
    const slug = (link.getAttribute("href").split(`/${kind}/`)[1] || "").split("/")[0];
    // A leading minus is the menu's "exclude" form.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || found.has(slug)) continue;
    found.set(slug, link.textContent.trim() || slug);
  }
  return [...found];
}

/** A native select in the accessory style: Letterboxd's own dropdowns are wired by their jQuery. */
function dropdown(label, options) {
  const select = el("select");
  select.setAttribute("aria-label", label);
  for (const [value, text] of options) {
    const option = el("option", null, text);
    option.value = value;
    select.appendChild(option);
  }

  // A span, not a label: Letterboxd styles every label as a white 13px block.
  const wrapper = el("span", "accessory lbx-select");
  wrapper.appendChild(select);
  return { wrapper, select };
}

function tile(film) {
  const { facts } = film;
  const year = facts?.year ?? film.year;

  const caption = [];
  if (facts?.runtime) caption.push(el("span", "lbx-runtime", `${facts.runtime} mins`));
  if (year) caption.push(el("span", "lbx-year", String(year)));

  const directors = facts?.directors?.length ? ` · ${facts.directors.join(", ")}` : "";

  return posterTile({
    name: film.name,
    alt: filmTitle(film.name),
    href: film.link || `/film/${film.slug}/`,
    poster: film.poster,
    width: POSTER_WIDTH,
    tooltip: `${film.name}${directors}`,
    caption,
  });
}

function createPicker(list) {
  const { section, body, accessories } = buildSection({
    id: "lbx-picker",
    className: "lbx-picker",
    heading: "Pick a film",
    headingHref: list.url(),
  });

  const whose = list.own ? "your watchlist" : `${list.user}'s watchlist`;
  const inputs = {
    genre: dropdown("Genre", [["", "Any genre"], ...menuOptions("genre")]),
    decade: dropdown("Decade", [["", "Any decade"], ...menuOptions("decade")]),
    length: dropdown("Length", LENGTHS),
    friend: dropdown("Friend", [["", list.own ? "Just me" : `Just ${list.user}`]]),
  };
  const shuffle = actionLink("New three", () => run());
  accessories.append(...Object.values(inputs).map((input) => input.wrapper), shuffle);

  const friendNames = new Map();
  inputs.friend.select.disabled = true;
  loadFollowing(list.user)
    .then(({ people }) => {
      for (const { user, name } of people) {
        friendNames.set(user, name);
        const option = el("option", null, `With ${name}`);
        option.value = user;
        inputs.friend.select.appendChild(option);
      }
      inputs.friend.select.disabled = !people.length;
    })
    .catch((err) => console.warn("[letterboxd-extras] lbx-picker following", err));

  const settings = () => ({
    genre: inputs.genre.select.value,
    decade: inputs.decade.select.value,
    minutes: Number(inputs.length.select.value) || null,
    friend: inputs.friend.select.value || null,
  });

  // In memory as well as the storage cache, so "New three" on a pool that
  // came back partial doesn't crawl again.
  const pools = new Map();
  const seenBy = new Map();
  let onScreen = [];
  let latest = 0;

  async function buildPool(choice, progress, force) {
    const filters = { genre: choice.genre, decade: choice.decade };

    const mine = await loadWatchlist(list, filters, (p) => progress(`Reading ${whose}…`, p), { force });
    let pool = mine.films;
    let failed = mine.failed;
    let truncated = mine.truncated;

    if (choice.minutes) {
      const short = await loadShorterThan(
        list,
        filters,
        choice.minutes,
        (p) => progress("Finding films that fit…", p.phase === "pages" ? p : null),
        { force }
      );
      pool = onBoth(pool, short.films);
      failed += short.failed;
    }

    let theirs = null;
    if (choice.friend) {
      const name = friendNames.get(choice.friend) ?? choice.friend;
      theirs = await loadWatchlist(watchlistOf(choice.friend), filters, (p) => progress(`Reading ${name}'s watchlist…`, p), {
        force,
      });
      pool = onBoth(pool, theirs.films);
      failed += theirs.failed;
      truncated ||= theirs.truncated;
    }

    return { pool, failed, truncated, theirsEmpty: theirs ? !theirs.films.length : false };
  }

  function emptyMessage(choice, result) {
    if (!choice.friend) return `Nothing on ${whose} matches.`;
    const name = friendNames.get(choice.friend) ?? choice.friend;
    if (result.theirsEmpty) return `Nothing on ${name}'s watchlist matches, or it's private.`;
    return "Nothing matches on both watchlists.";
  }

  function render(choice, result, films) {
    body.textContent = "";

    if (!films.length) {
      statusLine(body, emptyMessage(choice, result));
      return;
    }

    body.appendChild(posterGrid(films.map(tile), POSTER_WIDTH));

    const notes = [];
    if (result.failed) notes.push(`${plural(result.failed, "page", "pages")} unavailable`);
    if (result.truncated) notes.push("only the first 200 pages read");
    if (notes.length) body.appendChild(el("p", "lbx-status -warning", `Partial data: ${notes.join(" · ")}.`));
  }

  async function run({ force = false } = {}) {
    const choice = settings();
    const key = JSON.stringify(choice);
    const ticket = ++latest;
    const current = () => ticket === latest;
    shuffle.classList.add("-disabled");

    try {
      let result = force ? null : pools.get(key);
      if (!result) {
        const status = statusLine(body, `Reading ${whose}…`);
        const progress = (text, p) => {
          if (current()) status.textContent = p?.total ? `${text} ${p.done} of ${p.total}` : text;
        };
        result = await buildPool(choice, progress, force);
        pools.set(key, result);
      }
      if (!current()) return;

      const { picks, seen } = drawFresh(result.pool, {
        count: PICKS,
        seen: seenBy.get(key) ?? new Set(),
        current: onScreen,
      });
      seenBy.set(key, seen);

      // A missing runtime or poster only thins the caption; it's no reason to fail.
      const films = await Promise.all(
        picks.map(async (film) => {
          const [facts, poster] = await Promise.all([
            filmFacts(film).catch(() => null),
            filmPoster(film, POSTER_WIDTH).catch(() => null),
          ]);
          return { ...film, facts, poster };
        })
      );
      if (!current()) return;

      onScreen = picks;
      render(choice, result, films);
    } catch (err) {
      if (!current()) return;
      errorLine(body, `Couldn't read ${whose}.`, () => run({ force: true }));
      console.warn("[letterboxd-extras] lbx-picker", err);
    } finally {
      if (current()) shuffle.classList.remove("-disabled");
    }
  }

  for (const input of Object.values(inputs)) input.select.addEventListener("change", () => run());

  return { section, run };
}

export default {
  id: "lbx-picker",

  mount(list) {
    let picker = null;

    const sync = () => {
      const picking = location.hash === HASH;
      document.documentElement.classList.toggle("lbx-picking", picking);
      if (!picking || picker) return;

      const column = document.querySelector(".js-watchlist-main-content");
      if (!column) return;
      picker = createPicker(list);
      column.prepend(picker.section);
      picker.run();
    };

    window.addEventListener("hashchange", sync);
    sync();
  },
};
