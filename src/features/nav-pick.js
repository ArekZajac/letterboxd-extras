/* A nav icon right of Activity that opens the picker on the signed-in member's
   own watchlist. Same markup as Activity, so their nav rules space and colour
   it; their tooltip binding runs once at load, so ours comes from tooltip.js. */

import { el, srOnly } from "../core/dom.js";
import { signedInUser } from "../core/profile.js";
import { withTooltip } from "../core/tooltip.js";

const LABEL = "Pick a film";

export default {
  id: "lbx-nav-pick",

  mount() {
    if (document.getElementById(this.id)) return;

    const me = signedInUser();
    const activity = document.querySelector(".main-nav .navitems > .main-nav-activity");
    if (!me || !activity) return;

    const link = el("a", "navlink has-icon");
    link.href = `/${me}/watchlist/#pick`;
    link.append(el("span", "icon"), srOnly("span", LABEL));
    withTooltip(link, LABEL);

    const item = el("li", "navitem lbx-nav-pick");
    item.id = this.id;
    item.appendChild(link);
    activity.after(item);
  },
};
