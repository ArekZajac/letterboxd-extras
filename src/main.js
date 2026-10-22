/* Feature registry.
 *
 * The nav icon goes on any page a member is signed in on, the picker on any
 * watchlist, the panels on a profile home page. Each feature finds its own
 * anchor and returns quietly if it isn't there; one throwing on mount can't
 * take the others down. Panel order matters only for placement: genres
 * anchors below log history, hot takes below genres.
 */

import { resolveProfile, resolveWatchlist } from "./core/profile.js";
import { installTooltips } from "./core/tooltip.js";
import eras from "./features/eras.js";
import genres from "./features/genres.js";
import hotTakes from "./features/hot-takes.js";
import logHistory from "./features/log-history.js";
import navPick from "./features/nav-pick.js";
import picker from "./features/picker.js";
import ratings from "./features/ratings.js";

const PANELS = [ratings, eras, logHistory, genres, hotTakes];

function mount(feature, context) {
  try {
    feature.mount(context);
  } catch (err) {
    console.error(`[letterboxd-extras] ${feature.id} failed to mount`, err);
  }
}

export function start() {
  installTooltips();
  mount(navPick);

  const watchlist = resolveWatchlist();
  if (watchlist) mount(picker, watchlist);

  const profile = resolveProfile();
  if (!profile) return;
  for (const feature of PANELS) mount(feature, profile);
}
