import {
  basicAuthToken,
  checkAuth,
  logout as dufsLogout,
  setAuthToken,
} from "../lib/dufs/client";

/** Session-scoped so credentials do not linger after the tab closes. */
const KEY = "dufs-auth";

interface SavedCredentials {
  token: string;
  user: string;
}

function readSaved(): SavedCredentials | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCredentials>;
    if (!parsed.token) return null;
    return { token: parsed.token, user: parsed.user ?? "" };
  } catch {
    return null;
  }
}

class AuthStore {
  user = $state<string | null>(null);
  /** Base64 `user:pass`; kept only in memory + sessionStorage, never in URLs. */
  token = $state<string | null>(null);

  isAuthed = $derived(!!this.token);

  /**
   * Re-attach saved credentials to the dufs client. Must run before the first
   * directory fetch so authenticated directories do not 401 on reload.
   */
  restore(): void {
    const saved = readSaved();
    if (!saved) return;
    this.token = saved.token;
    this.user = saved.user || null;
    setAuthToken(saved.token);
  }

  /** Verify against dufs CHECKAUTH, then persist. Throws on bad credentials. */
  async login(user: string, pass: string): Promise<string> {
    const token = basicAuthToken(user, pass);
    const name = (await checkAuth(token)) || user;
    this.token = token;
    this.user = name;
    setAuthToken(token);
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ token, user: name } satisfies SavedCredentials));
    } catch {
      /* private mode: stay logged in for this page lifetime only */
    }
    return name;
  }

  logout(): void {
    dufsLogout();
    this.token = null;
    this.user = null;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

export const auth = new AuthStore();
