# Letterboxd Profile Extras

Chromium extension that adds extra analytics panels to any Letterboxd member's profile page, and a film picker for watchlists. With the aim to adhere to Letterbox's visual language with existing css and components.

## Install

1. Go to `chrome://extensions`
2. Turn on Developer mode
3. Load unpacked → pick this folder
4. Open any Letterboxd profile

## Features

### Eras

![Eras](assets/eras.jpg)

A histogram of the release years of every film the member has watched. Defaults to decade buckets, the header link names the view you're currently in and switches to the other one. Bars link through to the matching Letterboxd filter.

### Log History

![Log History](assets/history.jpg)

Diary entries over time, in four views: by day, by week, by month and by year. Longest streak is all-time, not scoped to whatever is on screen.

### Genres

![Genres](assets/genres.jpg)

Most-watched genres as ranked horizontal bars. Top 8 with a "Show all" toggle, rows link through to the genre filter. Films carry several genres each, so these counts deliberately sum to more than the number of films watched, and each bar's tooltip gives it as a share of films watched.

### Hot Takes

![Hot Takes](assets/takes.jpg)

The films the member rates furthest from the crowd. Two poster rows matching Favorite Films and Recent Activity, four each: hotter above, colder below, with the member's stars and the deviation from the community average under each poster. Hovering a poster gives their rating, the community average and how many ratings it rests on.

### Ratings Rework

![Ratings](assets/ratings.jpg)

Edits Letterboxd's existing sidebar histogram, dropping the flanking ★ glyphs so the plot spans the full width, replacing it with a ½ … 5 scale underneath with a midpoint tick. Also shows the mean rating of all logged movies beside the rated count.

### Pick a Film

A die in the top nav, right of Activity, opens `/{you}/watchlist/#pick`: three films from your watchlist as posters, with runtime and release year underneath and title and director on hover. "New three" draws again, and no film comes round twice until the whole pool has been shown. Four filters narrow the pool: genre, decade, a maximum runtime (90 minutes, 2 hours or 2½ hours), and a friend from the people you follow, which keeps only the films on both your watchlists. The draw leans towards the films that have waited longest: the newest addition weighs 1 and the oldest N.

Back, or any link to the plain watchlist, brings the grid back. It works on anyone's watchlist with `#pick` on the end, suggesting from theirs.

## How the Data is Collected

Ratings costs nothing. Every bar of the native histogram already carries its exact count in the tooltip text the page shipped with, so the mean is a DOM read with no crawl and no wait.

The other panels do have to scrape. There's no longer a public API, so they read the member's own paginated list pages with same-origin `fetch` and parse them with `DOMParser`. The requests go without cookies, because the viewer's account filters (hide short films, show films in watchlist and so on) live in a cookie the server applies to every film grid, and would skew the counts:

- The films index (`core/films.js`), used by both Eras and Hot Takes: `/{user}/films/by/rating/`, 72 per page. Each tile gives the title, slug, release year (from `data-item-name`, `"Look Back (2026)"`, falling back to the slug) and the member's own rating, rendered as stars. Walking the _community rating_ sort rather than the default costs nothing extra and hands Hot Takes an exact community-average rank for free. One crawl serves both panels.

- Diary dates: `/{user}/diary/` then `/{user}/diary/films/page/N/`, 50 per page. The date comes off `a.daydate`'s href (`/{user}/diary/films/for/2026/09/07/`), so rewatches count separately.

Page count is read from the paginator, then the remaining pages go through the same `pooled()` helper and the same shared limiter as everything else. Results are aggregated to counts (`{year: n}` and `{"YYYY-MM-DD": n}`) before being cached in `chrome.storage.local` for 6 hours, so only the first view of a profile pays the crawl cost.

Genre isn't in the films grid, so it can't come out of the Eras crawl, and there's no count anywhere in the filter UI. But a filtered list can be counted without walking it: page 1 gives both the page size and the page count, so only the last page has to be fetched for the remainder. A genre therefore costs one request when it fits on a page and two when it doesn't, instead of one per page of results. The 19 genre slugs are read off the member's own films page rather than hardcoded, so a new genre on Letterboxd's side turns up on its own.

Hot Takes needs the community average, which isn't on any list page. It doesn't need the 330 KB film page either. Letterboxd renders the rating histogram as a standalone component:

```
/csi/film/parasite-2019/rating-histogram/
-> 5.7 KB, "Weighted average of 4.52 based on 5,826,510 ratings"
```

About 56x smaller than the film page, so a few dozen are cheap. Still one request per film, which is what the crawl order buys back. `/{user}/films/by/rating/` is sorted by exactly that weighted average - checked against 65 measured averages with zero inversions across all 2,080 pairs - so a film's position in the index _is_ its exact community rank, without knowing the value. Under 200 rated films every one is measured, which is exact. Above that, rank is scored against the member's own rating to shortlist the 25 likeliest extremes per side, and only those are measured: about 50 requests instead of one per film. That shortlist is a heuristic and can miss a borderline entry on a very large account, so the panel says how many of the rated films it actually measured.

Averages resting on fewer than 1,000 community ratings are dropped, because a handful of ratings makes an average that is mostly noise and would otherwise dominate the extremes.

### The picker

Every filter is a hard filter, and each is chosen to keep the crawl the size of the answer:

- Genre and decade are path segments, `/{user}/watchlist/genre/horror/decade/1980s/`, so the server does the filtering. Their options are read off the watchlist's own filter menu.
- Runtime is on no list page, but `/film/<slug>/json/` has it in about 500 bytes, with the year and directors. `by/shortest/` sorts a watchlist by runtime with the runtime-less films last, so "at most N minutes" is the front of that list, and a binary search finds where it ends with one JSON lookup per probe instead of one per film. On a 317-film watchlist, "up to 2 hours" cost 3 pages and 8 lookups; on a 1,528-film one, "up to 90 minutes" cost 25 pages and 13.
- A friend is anyone you follow, which is what Letterboxd itself means by friends. `/following/` has only a Next link, 25 people per page, so it's read a page at a time. Their watchlist is then crawled with the same filters and intersected with yours in the browser. Letterboxd's own "Show films in watchlist" would do the intersection for free, but it's a cookie that filters every grid on the site until you switch it off, so the picker leaves it alone.
- Your own watchlist is the one thing read with your cookie. It's the only way to see a watchlist that's been made private, your account filters are a fair say in what gets suggested, and it comes at 100 films a page instead of 28. A friend's list is read without it, like everything else.

Watchlists are cached for six hours, but an entry also counts as stale as soon as the film count in the page header changes, so a film you've just added is in the next draw. Runtimes and posters are cached for 30 days. "New three" costs at most six small requests, one JSON and one poster per film, and none for films shown before.

A cold open on a 317-film watchlist reads its 4 pages, the following list and six small lookups. Measured on 22/10/2026, a cold open on a 1,528-film one took 65 requests and 8 seconds, and picking a friend whose watchlist has 4,954 films took 177 requests and 26 seconds, with no refusals.

### Rate limiting

Every request in the extension goes through one shared limiter in `core/net.js`, capped at four in flight. Panels mount and crawl independently, so without it the ceiling would be `CONCURRENCY` per panel and three crawling panels would put nine requests on the wire at once, comfortably past the point where Cloudflare starts refusing them. Backoff sleeps happen outside the limiter so a retrying request isn't sitting on a slot another panel could use.

Letterboxd sits behind Cloudflare and will sporadically refuse a request in the middle of an otherwise healthy crawl. Measured at roughly 1 page in 20 at this request rate, either as a 403 challenge or a 429. Cloudflare also serves its interstitial with a 200, so `net.js` sniffs the body as well as the status. Every request retries with exponential backoff and jitter; any page that still fails is counted and surfaced as a "Partial data" line under the chart rather than being silently dropped, which is what previously turned throttling into quietly wrong numbers. A crawl that came back incomplete is also not written to the cache (`shouldCache` in `core/cache.js`), so a page reload retries it instead of serving short counts for the next six hours.

## Known limits

- A 3,000-film account is roughly 48 + 66 page requests on a cold load. It works, but it takes a few seconds and it is a lot of requests. `PAGE_CAP` in `src/core/net.js` caps it at 200 pages per list.
- The panels only fire on the profile home page (`/{user}/`). Detection is `body[data-owner]`, a path match, and the absence of `screen-member-child-page`. The picker fires on any watchlist page, found by `body.watchlist`, and the nav icon on any page you're signed in on.
- A friend with a big watchlist is a full crawl: 4,954 films took 177 requests and 26 seconds, cached for six hours after.
- A private watchlist and an empty one look the same from outside, so the picker can't say which a friend's is.
- With a maximum runtime set, films Letterboxd has no runtime for are left out.
- `src/early.js` hides the watchlist grid before first paint when the URL ends in `#pick`. If the rest of the extension then fails to start, the main column stays empty.
- Mounts once on page load. Letterboxd is server-rendered so that's nearly always fine, but a client-side navigation between profiles wouldn't re-mount.
- Insertion point for Log History is "right after Recent activity". On profiles that also have Recent reviews / Popular reviews / Tags, those still sit between it and Following.
- Selectors are pinned to Letterboxd's current markup (Sept 2026, the picker's Oct 2026). They're confined to the `extract*` functions, `core/bar-chart.js`, `core/profile.js`, each panel's `anchor`, `features/picker.js` and `features/nav-pick.js`.

## Tests

`node --test` runs the unit tests in `test/`, for the picker's draw and its runtime search. Node 22, no dependencies.
