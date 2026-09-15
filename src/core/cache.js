/* Aggregated results in chrome.storage.local. */

const NAMESPACE = "lbx";
const VERSION = "v3";
const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Usernames are case-insensitive, so lowercase them or you cache twice over. */
export function cacheKey(feature, user) {
  return `${NAMESPACE}:${VERSION}:${feature}:${user.toLowerCase()}`;
}

function read(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (result) => resolve(result?.[key]));
    } catch {
      resolve(undefined);
    }
  });
}

function write(key, value) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, resolve);
    } catch {
      resolve();
    }
  });
}

/**
 * @param {object} [options]
 * @param {boolean} [options.force]        skip the read
 * @param {(data) => boolean} [options.shouldCache]  refuse to persist, e.g. an
 *   incomplete crawl, so the next load retries instead of serving short counts
 * @param {(data) => boolean} [options.validate]     reject an entry written by
 *   an older version whose shape has since changed
 */
export async function cached(
  key,
  produce,
  { ttl = SIX_HOURS, force = false, shouldCache = () => true, validate } = {}
) {
  if (!force) {
    const hit = await read(key);
    const fresh = hit && Date.now() - hit.fetchedAt < ttl;
    if (fresh && (!validate || validate(hit))) return hit;
  }

  const data = { ...(await produce()), fetchedAt: Date.now() };
  if (shouldCache(data)) await write(key, data);
  return data;
}
