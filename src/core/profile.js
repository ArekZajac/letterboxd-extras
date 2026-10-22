/* Whose page is this, and who is signed in? */

/**
 * Letterboxd treats usernames as case-insensitive in URLs but body[data-owner]
 * carries the canonical casing, so /schaffrillas/ and /Schaffrillas/ are the
 * same page. Comparing them case-sensitively disables everything on any profile
 * whose canonical name isn't all lowercase.
 */
function isSamePath(a, b) {
  const normalise = (path) => {
    let out = path;
    try {
      out = decodeURIComponent(path);
    } catch {
      // malformed escape; compare it raw
    }
    return out.toLowerCase().replace(/\/+$/, "") + "/";
  };
  return normalise(a) === normalise(b);
}

export function resolveProfile() {
  const body = document.body;
  const user = body?.dataset.owner;
  if (!user) return null;

  // Child pages (/user/films/, /user/diary/, …) carry data-owner too.
  if (body.classList.contains("screen-member-child-page")) return null;
  if (!isSamePath(location.pathname, `/${user}/`)) return null;

  return { user, url: (sub = "") => `/${user}/${sub}` };
}

/** Read off the account menu's own Watchlist link, the one place every page names them. */
export function signedInUser() {
  if (!document.body?.classList.contains("logged-in")) return null;
  const href = document.querySelector('.nav-account a[href$="/watchlist/"]')?.getAttribute("href");
  return href?.match(/^\/([^/]+)\/watchlist\/$/)?.[1] ?? null;
}

/**
 * A member's watchlist, under any filter or sort. The body carries no
 * data-owner here, but the profile header names them in canonical casing.
 */
export function resolveWatchlist() {
  if (!document.body?.classList.contains("watchlist")) return null;

  const user =
    document.querySelector(".profile-header[data-person]")?.dataset.person ??
    location.pathname.split("/")[1];
  if (!user) return null;

  const me = signedInUser();
  const count = document.querySelector(".js-watchlist-count")?.textContent.replace(/\D/g, "");

  return {
    user,
    own: !!me && me.toLowerCase() === user.toLowerCase(),
    // Cheap freshness check for anything cached from this list.
    size: count ? Number(count) : null,
    url: (sub = "") => `/${user}/watchlist/${sub}`,
  };
}
