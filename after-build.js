import fs from "node:fs";

let index = fs.readFileSync("dist/index.html", { encoding: "utf-8" });

// Rewrite asset paths: href="/assets/..." → href="__ASSETS_PREFIX__assets/..."
index = index.replace(/href="\/assets\//g, 'href="__ASSETS_PREFIX__assets/');
index = index.replace(/src="\/assets\//g, 'src="__ASSETS_PREFIX__assets/');

// Cache-bust the icons (svg/png favicon + apple-touch-icon); bump on redesign.
const ICON_VERSION = "20261003-wordmark-2";
index = index.replace(
  /href="__ASSETS_PREFIX__(favicon\.svg|favicon\.png|apple-touch-icon\.png)(\?v=[^"]*)?"/g,
  `href="__ASSETS_PREFIX__$1?v=${ICON_VERSION}"`,
);


// Add __INITIAL_DATA__ injection for production (dufs replaces __INDEX_DATA__ with base64).
// Wrap in try/catch: placeholder __INDEX_DATA__ makes atob() throw → without this the whole script dies and the app never mounts.
if (!index.includes("__INDEX_DATA__")) {
  index = index.replace(
    "// window.__INITIAL_DATA__ = JSON.parse(...)",
    [
      "try {",
      '  window.__INITIAL_DATA__ = JSON.parse((e => typeof Uint8Array.fromBase64 === "function" ? (new TextDecoder).decode(Uint8Array.fromBase64(e)) : decodeURIComponent(escape(atob(e))))("__INDEX_DATA__"));',
      "} catch (e) {",
      '  console.warn("[dufs] __INITIAL_DATA__ parse skipped", e);',
      "}",
    ].join("\n      "),
  );
}

fs.writeFileSync("dist/index.html", index);
console.log("after-build: asset paths rewritten");
