import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const DUFS_ORIGIN = process.env.DUFS_ORIGIN ?? "http://127.0.0.1:5001";

export default defineConfig({
  plugins: [
    svelte(),
    {
      // In dev, assets live at the Vite root; dufs replaces __ASSETS_PREFIX__ in
      // production (after-build rewrites/validates it).
      name: "dufs-assets-prefix",
      // "pre": swap the placeholder before Vite resolves URLs, or it becomes "//".
      transformIndexHtml: {
        order: "pre",
        handler(html: string, ctx: { server?: unknown }) {
          return ctx.server ? html.replaceAll("__ASSETS_PREFIX__", "/") : html;
        },
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const n = assetInfo.names?.[0] ?? "";
          // dufs expects the entry stylesheet at assets/index.css; lazy chunks keep hashed names.
          if (n === "index.css" || n === "style.css") return "assets/index.css";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
    chunkSizeWarningLimit: Infinity,
    target: "es2022",
  },
  server: {
    // 5173 is commonly taken by other local projects; keep this one distinct.
    port: 5180,
    strictPort: true,
    // dufs writes into dev-data (and we build into dist); do not full-reload the
    // SPA when those change.
    watch: {
      ignored: ["**/dev-data/**", "**/dist/**"],
    },
    proxy: {
      // Local dufs API + file bytes. Vite modules stay on the dev server.
      "^/.*": {
        target: DUFS_ORIGIN,
        changeOrigin: true,
        bypass(req) {
          const url = req.url ?? "";
          if (
            url.startsWith("/src/") ||
            url.startsWith("/@") ||
            url.startsWith("/node_modules/") ||
            url.includes(".svelte") ||
            url.startsWith("/favicon.") ||
            url.startsWith("/apple-touch-icon.png")
          ) {
            return url;
          }
          // Browser navigations → SPA shell from Vite
          const accept = req.headers.accept ?? "";
          if (req.method === "GET" && accept.includes("text/html") && !url.includes("json")) {
            return "/index.html";
          }
        },
      },
    },
  },
});
