/* Eras: release-year distribution, under the ratings histogram in the sidebar. */

import { barChart } from "../core/bar-chart.js";
import { actionLink, el, plural, statusLine } from "../core/dom.js";
import { isPlausibleYear, loadFilms } from "../core/films.js";
import { panel } from "../core/panel.js";

const DENSE_BAR_COUNT = 40; // above this, drop the gaps between bars

async function load(profile, onProgress, options) {
  const { films, failed, truncated } = await loadFilms(profile, onProgress, options);

  const years = {};
  let unknown = 0;

  for (const film of films) {
    if (isPlausibleYear(film.year)) years[film.year] = (years[film.year] || 0) + 1;
    else unknown += 1;
  }

  return { total: films.length, unknown, failed, truncated, years };
}

function render({ body, accessories, data, profile }) {
  const years = Object.keys(data.years).map(Number).sort((a, b) => a - b);

  body.textContent = "";
  accessories.textContent = "";

  if (!years.length) {
    statusLine(body, "No release years to chart yet.");
    return;
  }

  const earliest = years[0];
  const latest = years[years.length - 1];

  // The label names the view you're looking at, not the one you'd switch to.
  let mode = "decades";
  const toggle = actionLink("By decade", () => {
    mode = mode === "decades" ? "years" : "decades";
    draw();
  });
  accessories.appendChild(toggle);

  const chartSlot = el("div", "lbx-chart-slot");
  const axis = el("div", "lbx-axis");
  body.append(chartSlot, axis);

  if (data.failed || data.truncated) {
    const parts = [];
    if (data.failed) parts.push(`${plural(data.failed, "page", "pages")} unavailable`);
    if (data.truncated) parts.push("list capped");
    body.appendChild(el("p", "lbx-status -warning", `Partial data: ${parts.join(", ")}.`));
  }

  function buckets() {
    const out = [];

    if (mode === "years") {
      for (let year = earliest; year <= latest; year++) {
        const value = data.years[year] || 0;
        out.push({
          label: String(year),
          value,
          href: value ? profile.url(`films/year/${year}/`) : undefined,
        });
      }
      return out;
    }

    const from = Math.floor(earliest / 10) * 10;
    const to = Math.floor(latest / 10) * 10;
    for (let decade = from; decade <= to; decade += 10) {
      let value = 0;
      for (let year = decade; year < decade + 10; year++) value += data.years[year] || 0;
      out.push({
        label: `${decade}s`,
        value,
        href: value ? profile.url(`films/decade/${decade}s/`) : undefined,
      });
    }
    return out;
  }

  function draw() {
    toggle.textContent = mode === "decades" ? "By decade" : "By year";

    const bars = buckets().map((bucket) => ({
      ...bucket,
      tooltip: `${plural(bucket.value, "film", "films")} · ${bucket.label}`,
      text: `${bucket.label}: ${bucket.value}`,
    }));

    const chart = barChart({
      caption: `Films watched by release ${mode === "years" ? "year" : "decade"}`,
      categoryLabel: mode === "years" ? "Year" : "Decade",
      valueLabel: "Films",
      bars,
    });
    chart.classList.toggle("-dense", bars.length > DENSE_BAR_COUNT);

    chartSlot.replaceChildren(chart);
    axis.replaceChildren(
      el("span", null, bars[0].label),
      ...(bars.length > 1 ? [el("span", null, bars[bars.length - 1].label)] : [])
    );
  }

  draw();
}

export default panel({
  id: "lbx-eras",
  className: "lbx-eras",
  heading: "Eras",
  href: (profile) => profile.url("films/by/release/"),
  anchor: () => {
    const sidebar = document.querySelector("aside.wide-sidebar");
    // Sit beneath the native ratings histogram this visually echoes.
    return sidebar?.querySelector("section.ratings-histogram-chart") ?? sidebar?.lastElementChild;
  },
  loading: (progress) =>
    progress ? `Reading watched films… ${progress.done} of ${progress.total}` : "Reading watched films…",
  error: "Couldn't read the films list.",
  load,
  render,
});
