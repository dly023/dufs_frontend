import "./styles/index.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { prefs, applyTheme } from "./stores/prefs.svelte";
import { auth } from "./stores/auth.svelte";
import { directory } from "./stores/directory.svelte";
import { uploads } from "./stores/uploads.svelte";
import { trash } from "./stores/trash.svelte";
import { selection } from "./stores/selection.svelte";
import * as client from "./lib/dufs/client";
import { setupAuthLinksInterceptor } from "./lib/dufs/authLinks";
import { applySiteConfig } from "./lib/config";

// Site config (window.__DUFS_CONFIG__) seeds defaults before the first paint.
applySiteConfig(prefs);
applyTheme(prefs.theme);
// Re-attach saved credentials before the first directory fetch.
auth.restore();
setupAuthLinksInterceptor();

if (import.meta.env.DEV) {
  // Dev-only inspection hook: window.__dufs.directory.error / .loading / .raw
  (window as unknown as Record<string, unknown>).__dufs = { directory, prefs, auth, uploads, trash, selection, client };
}

const app = mount(App, { target: document.getElementById("app")! });

export default app;
