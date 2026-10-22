/* Film posters in Letterboxd's own markup.
 *
 * .poster-grid > ul.grid.-pN lays them out (-p150 fits four across a profile's
 * main column), .frame is the link with the title hidden inside it, and
 * .poster-viewingdata is the caption underneath.
 */

import { el } from "./dom.js";
import { fetchText } from "./net.js";
import { withTooltip } from "./tooltip.js";

/** Answers with a 255-byte {url, url2x} rather than the image itself. */
export async function posterFor(link, width) {
  const { url, url2x } = JSON.parse(await fetchText(`${link}poster/std/${width}/`));
  return { url, url2x };
}

/**
 * @param {object} spec
 * @param {string} spec.name     frame title, as Letterboxd writes it: "Title (2026)"
 * @param {string} spec.alt
 * @param {{url, url2x} | null} spec.poster  null draws Letterboxd's blank poster
 * @param {Node[]} [spec.caption]
 */
export function posterTile({ name, alt, href, poster, width, tooltip, caption = [] }) {
  const frame = el("div", "poster film-poster");

  if (poster?.url) {
    const img = el("img", "image");
    img.src = poster.url;
    if (poster.url2x) img.srcset = `${poster.url2x} 2x`;
    img.width = width;
    img.height = Math.round(width * 1.5);
    img.alt = alt;
    img.loading = "lazy";
    frame.appendChild(img);
  } else {
    frame.classList.add("no-poster");
  }

  const link = el("a", "frame");
  link.href = href;
  link.appendChild(el("span", "frame-title", name));
  if (tooltip) withTooltip(link, tooltip);
  frame.appendChild(link);

  const container = el("div", "viewing-poster-container");
  container.appendChild(frame);
  if (caption.length) {
    const viewingData = el("p", "poster-viewingdata");
    viewingData.append(...caption);
    container.appendChild(viewingData);
  }

  const item = el("li", "griditem");
  item.appendChild(container);
  return item;
}

export function posterGrid(tiles, size) {
  const grid = el("ul", `grid -p${size}`);
  grid.append(...tiles);

  const wrapper = el("div", "poster-grid");
  wrapper.appendChild(grid);
  return wrapper;
}
