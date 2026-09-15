/* A bar chart built from Letterboxd's own ratings histogram.
 *
 * Their CSS drives it entirely from a --value custom property per column:
 *
 *   .rating-histogram .chart *                         { display: flex; flex: 1 }
 *   .rating-histogram .chart .barcolumn > .bar         { align-self: end;
 *                                                        height: max(var(--value, 0) * 100%, 1px) }
 *   .rating-histogram .chart .barcolumn > .bar > .fill { background-color: currentColor }
 *
 * So this markup inherits equal column widths, bar heights, fill colour,
 * hover/focus/active states and light-dark theming. It's a real table with
 * screen-reader-only headers, exactly as they build it.
 */

import { el, srOnly } from "./dom.js";
import { withTooltip } from "./tooltip.js";

/**
 * @param {Array<{label, value, href?, tooltip?, text?}>} options.bars
 */
export function barChart({ caption, categoryLabel, valueLabel, bars }) {
  const peak = Math.max(1, ...bars.map((bar) => bar.value));

  const table = el("table", "chart");
  table.appendChild(srOnly("caption", caption));

  const head = srOnly("thead");
  const headRow = el("tr");
  for (const text of [categoryLabel, valueLabel]) {
    const cell = el("th", null, text);
    cell.scope = "col";
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const plot = el("tbody", "plot");

  for (const bar of bars) {
    const row = el("tr", "column");
    row.style.setProperty("--value", String(bar.value / peak));

    const rowHeader = srOnly("th", bar.label);
    rowHeader.scope = "row";

    // Their hover and focus rules are scoped to :any-link, so empty buckets
    // read as inert automatically.
    const column = bar.href ? el("a", "barcolumn") : el("span", "barcolumn");
    if (bar.href) column.href = bar.href;
    if (bar.tooltip) withTooltip(column, bar.tooltip);
    column.appendChild(srOnly("span", bar.text ?? String(bar.value)));

    const stem = el("span", "bar");
    stem.appendChild(el("span", "fill"));
    column.appendChild(stem);

    const cell = el("td", "cell");
    cell.appendChild(column);
    row.append(rowHeader, cell);
    plot.appendChild(row);
  }

  table.appendChild(plot);

  const layout = el("div", "layout");
  layout.appendChild(table);

  const histogram = el("div", "rating-histogram lbx-bar-chart");
  histogram.appendChild(layout);
  return histogram;
}
