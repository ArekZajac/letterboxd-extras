/* MV3 content scripts can't be modules, so this classic script is the one the
   manifest loads; everything below main.js uses plain import/export. */

(async () => {
  try {
    const { start } = await import(chrome.runtime.getURL("src/main.js"));
    start();
  } catch (err) {
    console.error("[letterboxd-extras] failed to start", err);
  }
})();
