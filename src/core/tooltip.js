/* Hover tooltips in the site's own style.
 *
 * Letterboxd uses twipsy (Bootstrap 1.x, jQuery) and builds
 * div.twipsy.fade.above.in > .twipsy-arrow + .twipsy-inner on <body>. Their
 * jQuery lives in the page's main world, which a content script can't reach,
 * so we build the same markup and let their stylesheet paint it.
 *
 * Targets carry their text in data-lbx-tip, never title: no OS tooltip, and no
 * collision with the site's own .tooltip bindings.
 */

import { el } from "./dom.js";

const TIP_ATTR = "data-lbx-tip";
const GAP = 2;

let bubble = null;
let installed = false;

export function withTooltip(node, text) {
  node.setAttribute(TIP_ATTR, text);
  node.removeAttribute("title");
  return node;
}

function hide() {
  bubble?.remove();
  bubble = null;
}

function show(target) {
  const text = target.getAttribute(TIP_ATTR);
  if (!text) return;
  hide();

  bubble = el("div", "twipsy fade above");
  bubble.append(el("div", "twipsy-arrow"), el("div", "twipsy-inner", text));
  document.body.appendChild(bubble);

  const rect = target.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = bubble;

  const below = rect.top - height - GAP < 0;
  if (below) bubble.classList.replace("above", "below");

  const top = below ? rect.bottom + GAP : rect.top - height - GAP;
  const margin = 4;
  const left = Math.max(
    margin,
    Math.min(rect.left + rect.width / 2 - width / 2, document.documentElement.clientWidth - width - margin)
  );

  // twipsy positions in document coordinates, not viewport.
  bubble.style.top = `${top + window.scrollY}px`;
  bubble.style.left = `${left + window.scrollX}px`;

  requestAnimationFrame(() => bubble?.classList.add("in"));
}

/** One delegated listener set, so panels drawn later need no extra wiring. */
export function installTooltips() {
  if (installed) return;
  installed = true;

  const targetFrom = (event) =>
    event.target instanceof Element ? event.target.closest(`[${TIP_ATTR}]`) : null;

  document.addEventListener("mouseover", (event) => {
    const target = targetFrom(event);
    if (target) show(target);
  });
  document.addEventListener("mouseout", (event) => {
    if (targetFrom(event)) hide();
  });
  document.addEventListener("focusin", (event) => {
    const target = targetFrom(event);
    if (target) show(target);
  });
  document.addEventListener("focusout", hide);

  // A bubble pinned in document coordinates would drift out of place.
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide, { passive: true });
}
