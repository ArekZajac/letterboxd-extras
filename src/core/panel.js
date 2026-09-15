/* A section that fetches something, then draws it. */

import { buildSection, errorLine, statusLine } from "./dom.js";

/**
 * @param {object} spec
 * @param {() => Element | null} spec.anchor   section is inserted after this
 * @param {(progress?: object) => string} spec.loading
 * @param {(profile, onProgress, options) => Promise<object>} spec.load
 * @param {(context: {body, accessories, data, profile}) => void} spec.render
 */
export function panel({ id, className, heading, href, anchor, loading, error, load, render }) {
  return {
    id,

    mount(profile) {
      if (document.getElementById(id)) return;

      const target = anchor();
      if (!target) return;

      const { section, body, accessories } = buildSection({
        id,
        className,
        heading,
        headingHref: href(profile),
      });
      target.after(section);

      async function run(force = false) {
        const status = statusLine(body, loading());
        try {
          const data = await load(
            profile,
            (progress) => {
              status.textContent = loading(progress);
            },
            { force }
          );
          render({ body, accessories, data, profile });
        } catch (err) {
          // Retry forces a refetch; without that it would re-read whatever bad
          // cache entry caused the failure and fail identically.
          errorLine(body, error, () => run(true));
          console.warn(`[letterboxd-extras] ${id}`, err);
        }
      }

      run();
    },
  };
}
