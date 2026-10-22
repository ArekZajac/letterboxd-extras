/* Runs before first paint, so a watchlist opened at #pick hides its grid from
   the start rather than flashing it until the picker mounts at document_idle. */

if (location.hash === "#pick") document.documentElement.classList.add("lbx-picking");
