/**
 * Where you stopped in each video (seconds), kept small and local.
 * Resume only when it is worth it: past the first 10 s and before the last 5 %.
 */
const KEY = "dufs-video-pos";
const MAX = 200;

type Positions = Record<string, { t: number; at: number }>;

function load(): Positions {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Positions;
  } catch {
    return {};
  }
}

function save(p: Positions) {
  try {
    const keys = Object.keys(p);
    if (keys.length > MAX) {
      keys.sort((a, b) => p[a].at - p[b].at);
      for (const k of keys.slice(0, keys.length - MAX)) delete p[k];
    }
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: resuming is a nicety */
  }
}

export function resumePoint(path: string, duration: number): number {
  const t = load()[path]?.t ?? 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return t > 10 && t < duration * 0.95 ? t : 0;
}

export function rememberPosition(path: string, t: number, duration: number) {
  const p = load();
  if (Number.isFinite(duration) && duration > 0 && (t <= 10 || t >= duration * 0.95)) delete p[path];
  else p[path] = { t: Math.round(t), at: Date.now() };
  save(p);
}

export function forgetPosition(path: string) {
  const p = load();
  delete p[path];
  save(p);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
