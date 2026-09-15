/* Log History: diary entries over time, under Recent activity.
 *
 * Four views of one grid. Nothing extra is fetched for the rolled-up ones; they
 * only re-bucket the day counts.
 *
 *   By day    weekday rows, week columns, one year   (the classic calendar)
 *   By week   year rows,    week columns             (those columns, summed)
 *   By month  year rows,    Jan-Dec columns
 *   By year   one row,      year columns
 */

import { cacheKey, cached } from "../core/cache.js";
import { actionLink, el, plural, statusLine } from "../core/dom.js";
import { crawl } from "../core/net.js";
import { panel } from "../core/panel.js";
import { withTooltip } from "../core/tooltip.js";

const DAY_MS = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_INITIALS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MAX_LEVEL = 4;
const MODES = ["day", "week", "month", "year"];
const MODE_LABEL = { day: "By day", week: "By week", month: "By month", year: "By year" };

/**
 * Each diary row has three /for/ links — month, year, then day. Taking the
 * first gives /for/2026/09/ and a y/m/d regex never matches, emptying the
 * whole diary. a.daydate is the day-precision one.
 */
function extractDiaryDates(doc) {
  const dates = [];

  for (const row of doc.querySelectorAll("tr.diary-entry-row, .diary-entry-row")) {
    const dayLink = row.querySelector("a.daydate") || findDayLink(row);
    const match = dayLink?.getAttribute("href")?.match(/\/for\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (match) dates.push(`${match[1]}-${match[2]}-${match[3]}`);
  }

  return dates;
}

function findDayLink(row) {
  return [...row.querySelectorAll('a[href*="/for/"]')].find((a) =>
    /\/for\/\d{4}\/\d{2}\/\d{2}\//.test(a.getAttribute("href") || "")
  );
}

async function load(profile, onProgress, { force = false } = {}) {
  return cached(
    cacheKey("diary", profile.user),
    async () => {
      // Page 1 is /user/diary/ but pages 2+ are /user/diary/films/page/N/.
      const { rows, failed, truncated } = await crawl({
        pathFor: (page) =>
          page === 1 ? profile.url("diary/") : profile.url(`diary/films/page/${page}/`),
        extract: extractDiaryDates,
        onProgress,
      });

      const days = {};
      for (const day of rows) days[day] = (days[day] || 0) + 1;

      return { total: rows.length, failed, truncated, days };
    },
    {
      force,
      shouldCache: (data) => !data.failed,
      validate: (data) => !!data.days && typeof data.days === "object",
    }
  );
}

/** Monday-first calendar weeks covering a whole year, in UTC. */
function weeksForYear(year) {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const cursor = new Date(jan1.getTime() - ((jan1.getUTCDay() + 6) % 7) * DAY_MS);

  const dec31 = new Date(Date.UTC(year, 11, 31));
  const end = new Date(dec31.getTime() + (6 - ((dec31.getUTCDay() + 6) % 7)) * DAY_MS);

  const weeks = [];
  while (cursor <= end) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

const isoDay = (date) => date.toISOString().slice(0, 10);

function prettyDay(iso) {
  const [year, month, day] = iso.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Longest run of consecutive logged days. UTC keys, so no DST edge cases. */
function longestStreak(days) {
  let best = { length: 0, start: null, end: null };
  let start = null;
  let previous = null;
  let run = 0;

  for (const day of Object.keys(days).sort()) {
    if (previous && Date.parse(day) - Date.parse(previous) === DAY_MS) run += 1;
    else {
      start = day;
      run = 1;
    }
    if (run > best.length) best = { length: run, start, end: day };
    previous = day;
  }

  return best;
}

function rollUp(days) {
  const months = {};
  const years = {};
  for (const [day, count] of Object.entries(days)) {
    const month = day.slice(0, 7);
    const year = day.slice(0, 4);
    months[month] = (months[month] || 0) + count;
    years[year] = (years[year] || 0) + count;
  }
  return { months, years };
}

/**
 * Row 1 holds the column labels, column 1 the row labels, the rest are cells.
 * `cell` returns null for a slot outside the data.
 */
function buildGrid({ columns, rowLabels, columnLabels, cell, level, fill = false }) {
  const grid = el("div", `lbx-heat-grid${fill ? " -fill" : ""}`);
  grid.style.setProperty("--cols", String(columns));
  grid.style.setProperty("--rows", String(rowLabels.length));

  for (const { column, text, span = 1 } of columnLabels) {
    const label = el("span", "lbx-col-label", text);
    label.style.gridArea = `1 / ${column + 2} / 2 / span ${span}`;
    grid.appendChild(label);
  }

  rowLabels.forEach((text, row) => {
    if (!text) return;
    const label = el("span", "lbx-row-label", text);
    label.style.gridArea = `${row + 2} / 1 / ${row + 3} / 2`;
    grid.appendChild(label);
  });

  for (let row = 0; row < rowLabels.length; row++) {
    for (let column = 0; column < columns; column++) {
      const place = `${row + 2} / ${column + 2}`;
      const data = cell(row, column);

      if (!data) {
        const blank = el("span", "lbx-cell -outside");
        blank.style.gridArea = place;
        grid.appendChild(blank);
        continue;
      }

      const node = el(data.href ? "a" : "span", `lbx-cell -l${level(data.count)}`);
      node.style.gridArea = place;
      if (data.href) node.href = data.href;
      withTooltip(
        node,
        data.count ? `${plural(data.count, "film", "films")} · ${data.label}` : data.label
      );
      grid.appendChild(node);
    }
  }

  return grid;
}

function render({ body, accessories, data, profile }) {
  body.textContent = "";
  accessories.textContent = "";

  const dayKeys = Object.keys(data.days);
  if (!dayKeys.length) {
    statusLine(body, "Nothing logged in the diary yet.");
    return;
  }

  const totals = rollUp(data.days);
  const availableYears = [...new Set(dayKeys.map((day) => Number(day.slice(0, 4))))].sort(
    (a, b) => b - a
  );
  const ascendingYears = [...availableYears].reverse();
  const thisYear = new Date().getUTCFullYear();

  let activeYear = availableYears.includes(thisYear) ? thisYear : availableYears[0];
  let mode = "day";

  const weekCache = new Map();
  const weeksFor = (year) => {
    if (!weekCache.has(year)) weekCache.set(year, weeksForYear(year));
    return weekCache.get(year);
  };
  const maxWeeks = Math.max(...ascendingYears.map((year) => weeksFor(year).length));

  // Stepper first, so the toggle keeps its place on the right when it hides.
  const nav = el("div", "lbx-year-nav");
  const earlier = actionLink("‹", () => step(1));
  const later = actionLink("›", () => step(-1));
  earlier.classList.add("lbx-step");
  later.classList.add("lbx-step");
  earlier.setAttribute("aria-label", "Earlier year");
  later.setAttribute("aria-label", "Later year");
  const yearLabel = el("span", "lbx-year-label");
  nav.append(earlier, yearLabel, later);

  const toggle = actionLink(MODE_LABEL.day, () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    draw();
  });
  accessories.append(nav, toggle);

  function step(delta) {
    const next = availableYears.indexOf(activeYear) + delta;
    if (next < 0 || next >= availableYears.length) return;
    activeYear = availableYears[next];
    draw();
  }

  const scroller = el("div", "lbx-heat-scroll");
  body.appendChild(scroller);

  const streak = longestStreak(data.days);
  if (streak.length) {
    const value = el("span", "lbx-streak", `Longest streak ${plural(streak.length, "day", "days")}`);
    withTooltip(value, `${prettyDay(streak.start)} to ${prettyDay(streak.end)}`);
    const line = el("div", "lbx-heat-meta");
    line.appendChild(value);
    body.appendChild(line);
  }

  if (data.failed || data.truncated) {
    const parts = [];
    if (data.failed) parts.push(`${plural(data.failed, "page", "pages")} unavailable`);
    if (data.truncated) parts.push("diary capped");
    body.appendChild(el("p", "lbx-status -warning", `Partial data: ${parts.join(", ")}.`));
  }

  /** Where each month starts, in week columns. */
  function monthColumns(year) {
    const labels = [];
    const seen = new Set();
    weeksFor(year).forEach((week, column) => {
      for (const day of week) {
        if (day.getUTCFullYear() !== year) continue;
        const month = day.getUTCMonth();
        if (seen.has(month)) continue;
        seen.add(month);
        labels.push({ column, text: MONTHS[month], span: 4 });
      }
    });
    return labels;
  }

  // Day counts are small and their absolute value is the point, so the day view
  // keeps a fixed ramp. Weekly and monthly totals run to hundreds and would peg
  // every cell at the top of it, so those shade relative to their own busiest.
  const absoluteLevel = (count) => Math.min(count, MAX_LEVEL);
  const relativeLevel = (peak) => (count) =>
    count === 0 ? 0 : Math.max(1, Math.ceil((count / peak) * MAX_LEVEL));

  function dayGrid() {
    const weeks = weeksFor(activeYear);
    return buildGrid({
      columns: weeks.length,
      rowLabels: DAY_INITIALS,
      columnLabels: monthColumns(activeYear),
      level: absoluteLevel,
      cell(row, column) {
        const day = weeks[column][row];
        if (day.getUTCFullYear() !== activeYear) return null;
        const key = isoDay(day);
        const count = data.days[key] || 0;
        return {
          count,
          label: `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${activeYear}`,
          href: count ? profile.url(`diary/films/for/${key.replace(/-/g, "/")}/`) : undefined,
        };
      },
    });
  }

  function weekGrid() {
    const weekTotal = (year, column) => {
      const week = weeksFor(year)[column];
      if (!week) return null;
      let count = 0;
      let inYear = false;
      for (const day of week) {
        if (day.getUTCFullYear() !== year) continue;
        inYear = true;
        count += data.days[isoDay(day)] || 0;
      }
      return inYear ? { count, monday: week[0] } : null;
    };

    let peak = 1;
    for (const year of ascendingYears) {
      for (let column = 0; column < maxWeeks; column++) {
        peak = Math.max(peak, weekTotal(year, column)?.count ?? 0);
      }
    }

    return buildGrid({
      columns: maxWeeks,
      rowLabels: ascendingYears.map(String),
      // Week columns line up to within a few days across years, so one year's
      // month boundaries label the whole matrix well enough to navigate by.
      columnLabels: monthColumns(ascendingYears.at(-1)),
      level: relativeLevel(peak),
      fill: true,
      cell(row, column) {
        const week = weekTotal(ascendingYears[row], column);
        // Letterboxd has no week-level diary filter, so these don't link out.
        return week && { count: week.count, label: `week of ${prettyDay(isoDay(week.monday))}` };
      },
    });
  }

  function monthGrid() {
    return buildGrid({
      columns: 12,
      rowLabels: ascendingYears.map(String),
      columnLabels: MONTHS.map((text, column) => ({ column, text })),
      level: relativeLevel(Math.max(1, ...Object.values(totals.months))),
      fill: true,
      cell(row, column) {
        const year = ascendingYears[row];
        const month = String(column + 1).padStart(2, "0");
        const count = totals.months[`${year}-${month}`] || 0;
        return {
          count,
          label: `${MONTHS[column]} ${year}`,
          href: count ? profile.url(`diary/films/for/${year}/${month}/`) : undefined,
        };
      },
    });
  }

  function yearGrid() {
    return buildGrid({
      columns: ascendingYears.length,
      rowLabels: [""],
      columnLabels: ascendingYears.map((year, column) => ({ column, text: String(year) })),
      level: relativeLevel(Math.max(1, ...Object.values(totals.years))),
      fill: true,
      cell(row, column) {
        const year = ascendingYears[column];
        const count = totals.years[String(year)] || 0;
        return {
          count,
          label: String(year),
          href: count ? profile.url(`diary/films/for/${year}/`) : undefined,
        };
      },
    });
  }

  const GRIDS = { day: dayGrid, week: weekGrid, month: monthGrid, year: yearGrid };

  function draw() {
    toggle.textContent = MODE_LABEL[mode];
    nav.hidden = mode !== "day"; // picking a year only means something by day

    const grid = GRIDS[mode]();
    scroller.replaceChildren(grid);

    if (mode === "day") {
      // The rolled-up views match this height. Measured synchronously, not in
      // requestAnimationFrame, which never fires while the tab is backgrounded.
      const height = Math.round(grid.getBoundingClientRect().height);
      if (height) body.style.setProperty("--lbx-heat-height", `${height}px`);
    }

    const index = availableYears.indexOf(activeYear);
    yearLabel.textContent = String(activeYear);
    earlier.classList.toggle("-disabled", index >= availableYears.length - 1);
    later.classList.toggle("-disabled", index <= 0);
  }

  draw();
}

export default panel({
  id: "lbx-log-history",
  className: "lbx-log-history",
  heading: "Log History",
  href: (profile) => profile.url("diary/"),
  anchor: () => document.querySelector("#recent-activity"),
  loading: (progress) =>
    progress ? `Reading diary… page ${progress.done} of ${progress.total}` : "Reading diary…",
  error: "Couldn't read the diary.",
  load,
  render,
});
