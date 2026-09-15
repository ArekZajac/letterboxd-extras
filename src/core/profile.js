/* Whose profile is this, and is it the profile home page? */

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
