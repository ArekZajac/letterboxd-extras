/* Adjustments to Letterboxd's own ratings histogram.
 *
 * The only panel that edits existing markup instead of adding a section, and
 * the only one that costs no requests: every bar already carries its exact
 * count in the tooltip text the page shipped with.
 */

import { el } from "../core/dom.js";

const SECTION_SELECTOR = "section.ratings-histogram-chart";
const MOUNTED_FLAG = "lbxRatings";

/** /films/ratings/rated/1½/by/date/ -> 1.5 */
function ratingFromHref(column) {
  let href = column.getAttribute("href") || "";
  try {
    href = decodeURIComponent(href);
  } catch {
    // leave it encoded; the ½ won't match and the bar is skipped
  }
  const match = href.match(/\/rated\/([^/]+)\//);
  if (!match) return null;
  const token = match[1];
  return (parseInt(token, 10) || 0) + (token.includes("½") ? 0.5 : 0);
}

/** twipsy moves title into data-original-title when it initialises. */
function countFromLabel(column) {
  const text =
    column.getAttribute("data-original-title") ||
    column.getAttribute("title") ||
    column.querySelector("._sr-only")?.textContent ||
    "";
  const match = text.replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function readAverage(histogram) {
  let total = 0;
  let weighted = 0;

  for (const row of histogram.querySelectorAll("tr.column")) {
    const column = row.querySelector(".barcolumn");
    const rating = column && ratingFromHref(column);
    if (rating == null) continue;
    const count = countFromLabel(column);
    total += count;
    weighted += rating * count;
  }

  return total ? weighted / total : null;
}

function buildAxis() {
  const axis = el("div", "lbx-axis -ticked");
  axis.append(el("span", null, "½"), el("span", "lbx-axis-tick"), el("span", null, "5"));
  return axis;
}

export default {
  id: "lbx-ratings",

  mount() {
    const section = document.querySelector(SECTION_SELECTOR);
    if (!section || section.dataset[MOUNTED_FLAG]) return;

    const histogram = section.querySelector(".rating-histogram");
    const layout = histogram?.querySelector(":scope > .layout");
    if (!layout) return;

    section.dataset[MOUNTED_FLAG] = "1";
    const average = readAverage(histogram);

    // Their own `.layout:not(:has(> .stars)) > .chart { grid-column-start:
    // rating-start }` stretches the plot across once these are gone.
    for (const stars of layout.querySelectorAll(":scope > svg.stars")) stars.remove();

    // Inside .rating-histogram, so the axis inherits its width and centring.
    layout.after(buildAxis());

    if (average != null) {
      section
        .querySelector(".section-accessories")
        ?.appendChild(el("span", "lbx-average", `${average.toFixed(1)} avg`));
    }
  },
};
