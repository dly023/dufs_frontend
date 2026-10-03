<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import LazyImage from "../views/LazyImage.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { directory } from "../stores/directory.svelte";
  import { auth } from "../stores/auth.svelte";
  import { fetchBlobUrl } from "../lib/dufs/client";
  import { previewableAudioExts } from "../lib/models/exts";
  import { dirName } from "../lib/models/path";
  import { playerOwnsKey } from "../lib/media/keys";

  interface Props {
    item: PathItem;
    /** Resolved source for `item` (a blob URL behind auth). */
    src: string;
    variant: "pane" | "full";
    /** Track changes become real navigation (title, URL and selection follow). */
    onTrack?: (item: PathItem) => void;
  }
  let { item, src, variant, onTrack }: Props = $props();

  type Mode = "seq" | "one" | "shuffle";
  const MODES: { id: Mode; label: string }[] = [
    { id: "seq", label: "顺序" },
    { id: "one", label: "单曲" },
    { id: "shuffle", label: "随机" },
  ];

  let root = $state<HTMLDivElement>();
  let audio = $state<HTMLAudioElement>();
  /** A track picked inside the player; null = the file that was opened. */
  let picked = $state<PathItem | null>(null);
  const current = $derived(picked ?? item);
  let currentSrc = $state("");
  let playing = $state(false);
  let mode = $state<Mode>(loadMode());

  // A new file opened from outside resets the player to it.
  $effect(() => {
    void item.fullpath;
    picked = null;
  });

  const tracks = $derived(directory.sortedPaths.filter((p) => !p.is_dir && previewableAudioExts.has(p.ext.toLowerCase())));
  const index = $derived(tracks.findIndex((p) => p.fullpath === current.fullpath));
  const cover = $derived(
    directory.paths.find((p) => !p.is_dir && /^(cover|folder|front|album)\.(jpe?g|png|webp|avif)$/i.test(p.filename)) ?? null,
  );
  const title = $derived(current.filename.replace(/\.[^.]+$/, ""));
  const album = $derived(dirName(directory.path));

  function loadMode(): Mode {
    try {
      const m = localStorage.getItem("dufs-audio-mode");
      return m === "one" || m === "shuffle" ? m : "seq";
    } catch {
      return "seq";
    }
  }

  function setMode(m: Mode) {
    mode = m;
    try {
      localStorage.setItem("dufs-audio-mode", m);
    } catch {
      /* ignore */
    }
  }

  // Resolve the playable URL (authed media needs a blob).
  $effect(() => {
    const it = current;
    if (it.fullpath === item.fullpath && src) {
      currentSrc = src;
      return;
    }
    if (!auth.isAuthed) {
      currentSrc = it.fullpath;
      return;
    }
    let cancelled = false;
    currentSrc = "";
    fetchBlobUrl(it.fullpath)
      .then((u) => !cancelled && (currentSrc = u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  function go(to: PathItem | undefined) {
    if (!to) return;
    if (onTrack) onTrack(to);
    else picked = to.fullpath === item.fullpath ? null : to;
  }

  function step(delta: number, auto = false) {
    if (!tracks.length) return;
    if (mode === "shuffle" && tracks.length > 1) {
      let i = index;
      while (i === index) i = Math.floor(Math.random() * tracks.length);
      return go(tracks[i]);
    }
    const next = index + delta;
    // Sequential play stops after the last track; manual skipping wraps.
    if (auto && next >= tracks.length) return;
    go(tracks[(next + tracks.length) % tracks.length]);
  }

  function prev() {
    // Like every player: a few seconds in, "previous" restarts the track.
    if (audio && audio.currentTime > 3) audio.currentTime = 0;
    else step(-1);
  }

  function onEnded() {
    playing = false;
    if (mode !== "one") step(1, true);
  }

  // Lock screen / media keys.
  $effect(() => {
    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata === "undefined") return;
    ms.metadata = new MediaMetadata({
      title,
      artist: album,
      album,
      artwork: cover && !auth.isAuthed ? [{ src: new URL(cover.fullpath, location.href).href }] : [],
    });
  });

  $effect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* unsupported action */
      }
    };
    set("play", () => void audio?.play());
    set("pause", () => audio?.pause());
    set("previoustrack", () => prev());
    set("nexttrack", () => step(1));
    set("seekbackward", (d) => audio && (audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset ?? 10))));
    set("seekforward", (d) => audio && (audio.currentTime += d.seekOffset ?? 10));
    set("seekto", (d) => audio && d.seekTime !== undefined && (audio.currentTime = d.seekTime));
    return () => {
      ms.metadata = null;
      for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[]) set(a, null);
    };
  });

  function onKey(e: KeyboardEvent) {
    if (!audio || !playerOwnsKey(e, root, variant === "full")) return;
    if (e.key === " ") audio.paused ? void audio.play() : audio.pause();
    else if (e.key === "ArrowUp") audio.volume = Math.min(1, audio.volume + 0.1);
    else if (e.key === "ArrowDown") audio.volume = Math.max(0, audio.volume - 0.1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="ap {variant}" bind:this={root} role="group" aria-label="音频播放器" tabindex="-1">
  <div class="art" class:is-playing={playing}>
    {#if cover}
      <LazyImage item={cover} alt="" />
    {:else}
      <span class="disc"><Icon name="music" size={variant === "full" ? 40 : 30} stroke={1.5} /></span>
    {/if}
  </div>

  <div class="meta">
    <strong class="title" title={current.filename}>{title}</strong>
    <span class="sub num">{album}{#if tracks.length > 1 && index >= 0}{` · ${index + 1} / ${tracks.length}`}{/if}</span>
  </div>

  <!-- svelte-ignore a11y_media_has_caption -->
  <audio
    bind:this={audio}
    src={currentSrc || undefined}
    controls
    autoplay
    preload="metadata"
    loop={mode === "one"}
    onplay={() => (playing = true)}
    onpause={() => (playing = false)}
    onended={onEnded}
  ></audio>

  <div class="controls">
    <button class="icon-btn" type="button" title="上一首" onclick={prev} disabled={tracks.length < 2}>
      <Icon name="skipBack" size={16} />
    </button>
    <div class="seg" style:--n="3" style:--i={MODES.findIndex((m) => m.id === mode)} role="tablist" aria-label="播放顺序">
      {#each MODES as m (m.id)}
        <button type="button" role="tab" aria-selected={mode === m.id} onclick={() => setMode(m.id)}>{m.label}</button>
      {/each}
    </div>
    <button class="icon-btn" type="button" title="下一首" onclick={() => step(1)} disabled={tracks.length < 2}>
      <Icon name="skipForward" size={16} />
    </button>
  </div>

  {#if variant === "full" && tracks.length > 1}
    <ol class="queue">
      {#each tracks as t, i (t.fullpath)}
        <li>
          <button type="button" class:is-current={t.fullpath === current.fullpath} onclick={() => go(t)}>
            <span class="n num">{i + 1}</span>
            <span class="ellipsis">{t.filename.replace(/\.[^.]+$/, "")}</span>
            {#if t.fullpath === current.fullpath && playing}<Icon name="music" size={13} />{/if}
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .ap {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    max-width: 440px;
    padding: var(--s-6) var(--s-4);
    outline: none;
  }

  .art {
    position: relative;
    width: 168px;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--r-lg);
    background: var(--fill-strong);
    box-shadow: var(--shadow-2);
    transition: transform var(--t-4) var(--ease-spring);
  }

  .full .art {
    width: 220px;
  }

  /* Playing: the cover leans forward a touch. */
  .art.is-playing {
    transform: scale(1.03);
  }

  .art :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .disc {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: radial-gradient(circle, var(--surface) 0 18%, var(--fill-strong) 19%);
    color: var(--text-3);
  }

  .meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    max-width: 100%;
    text-align: center;
  }

  .title {
    max-width: 100%;
    font-size: var(--fs-5);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .sub {
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  audio {
    width: 100%;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }

  .queue {
    align-self: stretch;
    max-height: 240px;
    overflow: auto;
    margin-top: var(--s-2);
    padding: var(--s-1);
    border-radius: var(--r-md);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .queue button {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    height: 32px;
    padding: 0 var(--s-2);
    border-radius: var(--r-sm);
    color: var(--text-2);
    font-size: var(--fs-3);
    text-align: left;
  }

  .queue button:hover {
    background: var(--fill);
    color: var(--text);
  }

  .queue button.is-current {
    color: var(--accent-text);
    font-weight: 550;
  }

  .queue .n {
    min-width: 2ch;
    color: var(--text-3);
    font-size: var(--fs-1);
    text-align: right;
  }

  .queue :global(svg) {
    margin-left: auto;
    flex: 0 0 auto;
  }
</style>
