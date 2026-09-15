/* Element helpers and the Letterboxd section scaffold. */

export const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** Letterboxd's visually-hidden class. */
export const srOnly = (tag, text) => el(tag, "_sr-only", text);

export const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** An empty section using the site's own header, divider and spacing classes. */
export function buildSection({ id, className = "", heading, headingHref }) {
  const section = el("section", `section lbx-section ${className}`.trim());
  section.id = id;

  const header = el("header", "section-header -divider -spaced-loose");
  const title = el("h2", "section-heading -omitdivider heading");
  const link = el("a", null, heading);
  if (headingHref) link.href = headingHref;
  title.appendChild(link);

  const aside = el("aside", "aside");
  const accessories = el("div", "section-accessories lbx-accessories");
  aside.appendChild(accessories);
  header.append(title, aside);

  const body = el("div", "lbx-body");
  section.append(header, body);

  return { section, body, accessories, heading: link };
}

export function statusLine(body, text) {
  body.textContent = "";
  const line = el("p", "lbx-status", text);
  body.appendChild(line);
  return line;
}

export function errorLine(body, text, onRetry) {
  body.textContent = "";
  const line = el("p", "lbx-status -error", `${text} `);
  const retry = el("a", "lbx-link", "Try again");
  retry.href = "#";
  retry.addEventListener("click", (event) => {
    event.preventDefault();
    onRetry();
  });
  line.appendChild(retry);
  body.appendChild(line);
}

/** A link in Letterboxd's uppercase accessory style. */
export function actionLink(text, onClick) {
  const link = el("a", "accessory lbx-action", text);
  link.href = "#";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    onClick(event);
  });
  return link;
}
