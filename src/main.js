/* Panel registry.
 *
 * Each panel finds its own anchor and returns quietly if it isn't there; one
 * throwing on mount can't take the others down. Order matters only for
 * placement: genres anchors below log history, hot takes below genres.
 */

import { resolveProfile } from "./core/profile.js";
import { installTooltips } from "./core/tooltip.js";
import eras from "./features/eras.js";
import genres from "./features/genres.js";
import hotTakes from "./features/hot-takes.js";
import logHistory from "./features/log-history.js";
import ratings from "./features/ratings.js";

const PANELS = [ratings, eras, logHistory, genres, hotTakes];

export function start() {
  const profile = resolveProfile();
  if (!profile) return;

  installTooltips();

  for (const feature of PANELS) {
    try {
      feature.mount(profile);
    } catch (err) {
      console.error(`[letterboxd-extras] ${feature.id} failed to mount`, err);
    }
  }
}
