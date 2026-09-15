/* Ranked horizontal bars: label, bar, value.
 *
 * Letterboxd has no horizontal bar component to borrow (its one <meter> style
 * is Firefox-only and leaves the fill colour undefined), so this is ours.
 */

import { el } from "./dom.js";
import { withTooltip } from "./tooltip.js";

/**
 * @param {Array<{label, value, text, href?, tooltip?}>} options.rows
 * @param {number} [options.peak]        value that fills the track
 * @param {number} [options.valueWidth]  characters to reserve for the value
 *   column; pass it when the visible rows are a subset, so bars don't shift
 *   when more are shown
 */
export function meterList({ rows, peak, valueWidth, className = "" }) {
  const list = el("div", `lbx-meter-list ${className}`.trim());

  const max = peak ?? Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  list.style.setProperty(
    "--lbx-meter-value-width",
    `${valueWidth ?? Math.max(...rows.map((row) => row.text.length))}ch`
  );

  for (const row of rows) {
    const node = row.href ? el("a", "lbx-meter") : el("div", "lbx-meter");
    if (row.href) node.href = row.href;
    node.style.setProperty("--value", String(Math.abs(row.value) / max));

    const track = el("span", "lbx-meter-track");
    track.appendChild(el("span", "lbx-meter-fill"));

    node.append(
      el("span", "lbx-meter-label", row.label),
      track,
      el("span", "lbx-meter-value", row.text)
    );

    if (row.tooltip) withTooltip(node, row.tooltip);
    list.appendChild(node);
  }

  return list;
}
