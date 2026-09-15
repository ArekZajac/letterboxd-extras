/* Fetching, with one request budget shared by every panel.
 *
 * Letterboxd sits behind Cloudflare and sporadically refuses a request mid
 * crawl — roughly 1 in 20 at this rate — as a 403 challenge or a 429, and it
 * serves the challenge with a 200, so the body has to be sniffed too.
 */

const RETRYABLE = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 700;

const PAGE_CAP = 200; // safety valve for very large accounts
const CONCURRENCY = 3; // workers within one crawl
const MAX_IN_FLIGHT = 4; // requests at once across the whole extension
const STAGGER_MS = 150;
const PAGE_GAP_MS = 90;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms) => ms * (0.75 + Math.random() * 0.5);

class Throttled extends Error {}

const isChallengePage = (html) =>
  /just a moment|cf-browser-verification|__cf_chl|cf_chl_opt/i.test(html.slice(0, 4000));

// Panels crawl independently, so without a shared budget the ceiling would be
// CONCURRENCY *per panel*.
let inFlight = 0;
const waiting = [];

function acquire() {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve)); // handed a slot directly
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else inFlight -= 1;
}

export async function fetchText(path, { attempts = MAX_ATTEMPTS } = {}) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Backing off outside the limiter, so a sleeping retry isn't holding a slot.
    if (attempt > 0) await sleep(jitter(BACKOFF_BASE_MS * 2 ** (attempt - 1)));

    let res;
    await acquire();
    try {
      res = await fetch(path, { credentials: "same-origin" });
    } catch (err) {
      lastError = err;
      continue;
    } finally {
      release();
    }

    if (res.ok) {
      const html = await res.text();
      if (!isChallengePage(html)) return html;
      lastError = new Throttled(`challenge page on ${path}`);
      continue;
    }

    if (!RETRYABLE.has(res.status)) throw new Error(`${res.status} on ${path}`);
    lastError = new Throttled(`${res.status} on ${path}`);
  }

  throw lastError ?? new Error(`could not fetch ${path}`);
}

export async function fetchDoc(path, options) {
  return new DOMParser().parseFromString(await fetchText(path, options), "text/html");
}

/** Highest page number linked from a Letterboxd paginator. */
export function lastPageNumber(doc) {
  let max = 1;
  for (const link of doc.querySelectorAll(".paginate-pages a, .pagination a")) {
    const fromHref = (link.getAttribute("href") || "").match(/\/page\/(\d+)\/?$/);
    if (fromHref) max = Math.max(max, Number(fromHref[1]));
    const fromText = Number(link.textContent.trim());
    if (Number.isInteger(fromText)) max = Math.max(max, fromText);
  }
  return max;
}

export function countPosters(doc) {
  return doc.querySelectorAll("li.griditem, li.poster-container").length;
}

/** Run `work` over `items` with a bounded pool, counting what fails. */
export async function pooled({ items, work, onProgress = () => {}, concurrency = CONCURRENCY }) {
  const queue = [...items];
  const total = items.length;
  const results = [];
  let done = 0;
  let failed = 0;

  onProgress({ done, total, failed });

  async function worker(index) {
    await sleep(index * STAGGER_MS);
    while (queue.length) {
      const item = queue.shift();
      try {
        results.push(await work(item));
      } catch (err) {
        failed += 1;
        console.warn("[letterboxd-extras] gave up on an item", err);
      }
      done += 1;
      onProgress({ done, total, failed });
      if (queue.length) await sleep(jitter(PAGE_GAP_MS));
    }
  }

  const workers = Math.min(concurrency, Math.max(1, total));
  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));

  return { results, failed };
}

/** Walk every page of a paginated list, calling extract() on each. */
export async function crawl({ pathFor, extract, onProgress = () => {}, pageCap = PAGE_CAP }) {
  const first = await fetchDoc(pathFor(1));
  const lastPage = lastPageNumber(first);
  const total = Math.min(lastPage, pageCap);

  const pages = [];
  for (let page = 2; page <= total; page++) pages.push(page);

  // Keyed by page, not appended as they land: pages finish out of order, and
  // Hot Takes reads a film's index in this list as its community rank.
  const byPage = new Map();

  const { failed } = await pooled({
    items: pages,
    work: async (page) => byPage.set(page, extract(await fetchDoc(pathFor(page)))),
    // Page 1 is already in hand, hence the offset.
    onProgress: ({ done, failed: pageFailures }) =>
      onProgress({ done: done + 1, total, failed: pageFailures }),
  });

  const rows = extract(first);
  for (const page of pages) rows.push(...(byPage.get(page) ?? []));

  return { rows, pages: total, failed, truncated: lastPage > pageCap };
}
