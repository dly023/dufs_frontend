<script lang="ts" module>
  /** Playback speed carries across videos within a session. */
  let sessionRate = 1;
</script>

<script lang="ts">
  import { tick } from "svelte";
  import Icon from "../components/Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { directory } from "../stores/directory.svelte";
  import { fetchFileText } from "../lib/dufs/client";
  import { findSubtitles, preferredTrack, toVtt } from "../lib/media/subtitles";
  import { formatClock, rememberPosition, resumePoint } from "../lib/media/resume";
  import { playerOwnsKey } from "../lib/media/keys";

  interface Props {
    item: PathItem;
    src: string;
    variant: "pane" | "full";
  }
  let { item, src, variant }: Props = $props();

  const RATES = [0.75, 1, 1.25, 1.5, 2];

  let root = $state<HTMLDivElement>();
  let video = $state<HTMLVideoElement>();
  let rate = $state(sessionRate);
  let tracks = $state<{ src: string; label: string; lang: string }[]>([]);
  let shownTrack = $state(-1);
  let resumedAt = $state(0);
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved = 0;

  const subs = $derived(findSubtitles(item, directory.paths));

  // Fetch + convert sibling subtitles to WebVTT blobs; revoke on change.
  $effect(() => {
    const list = subs;
    let cancelled = false;
    const made: string[] = [];
    tracks = [];
    shownTrack = -1;
    void (async () => {
      const loaded = await Promise.all(
        list.map(async (s) => {
          try {
            const vtt = toVtt(await fetchFileText(s.item.fullpath), s.format);
            const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
            made.push(url);
            return { src: url, label: s.label, lang: s.lang };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      tracks = loaded.filter((t): t is NonNullable<typeof t> => !!t);
      await tick();
      showTrack(preferredTrack(list.filter((_, i) => loaded[i])));
    })();
    return () => {
      cancelled = true;
      for (const u of made) URL.revokeObjectURL(u);
    };
  });

  function showTrack(i: number) {
    shownTrack = i;
    const tt = video?.textTracks;
    if (!tt) return;
    for (let k = 0; k < tt.length; k += 1) tt[k].mode = k === i ? "showing" : "disabled";
  }

  function cycleTrack() {
    // off → first → … → last → off
    showTrack(shownTrack + 1 >= tracks.length ? -1 : shownTrack + 1);
  }

  function onMeta() {
    if (!video) return;
    video.playbackRate = rate;
    const t = resumePoint(item.fullpath, video.duration);
    if (t) {
      video.currentTime = t;
      resumedAt = t;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => (resumedAt = 0), 6000);
    }
    showTrack(shownTrack);
  }

  function save(force = false) {
    if (!video || !Number.isFinite(video.duration)) return;
    const now = video.currentTime;
    if (!force && Math.abs(now - lastSaved) < 5) return;
    lastSaved = now;
    rememberPosition(item.fullpath, now, video.duration);
  }

  function restart() {
    if (video) video.currentTime = 0;
    resumedAt = 0;
  }

  function cycleRate() {
    const i = RATES.indexOf(rate);
    rate = RATES[(i + 1) % RATES.length];
    sessionRate = rate;
    if (video) video.playbackRate = rate;
  }

  $effect(() => {
    return () => {
      clearTimeout(hintTimer);
      save(true);
    };
  });

  function onKey(e: KeyboardEvent) {
    if (!video || !playerOwnsKey(e, root, variant === "full")) return;
    const k = e.key;
    if (k === " ") video.paused ? void video.play() : video.pause();
    else if (k === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 5);
    else if (k === "ArrowRight") video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
    else if (k === "ArrowUp") video.volume = Math.min(1, video.volume + 0.1);
    else if (k === "ArrowDown") video.volume = Math.max(0, video.volume - 0.1);
    else if (k === "f" || k === "F") {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void video.requestFullscreen().catch(() => {});
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="vp {variant}" bind:this={root} role="group" aria-label="视频播放器" tabindex="-1" onpointerdown={() => root?.focus({ preventScroll: true })}>
  <!-- Captions come from sibling subtitle files when present. -->
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={video}
    {src}
    controls
    autoplay
    playsinline
    preload="metadata"
    onloadedmetadata={onMeta}
    ontimeupdate={() => save()}
    onpause={() => save(true)}
    onended={() => save(true)}
  >
    {#each tracks as t, i (t.src)}
      <track kind="subtitles" src={t.src} label={t.label} srclang={t.lang || undefined} default={i === shownTrack} />
    {/each}
  </video>

  <div class="bar">
    {#if resumedAt}
      <span class="resume num">
        从 {formatClock(resumedAt)} 继续
        <button class="link" type="button" onclick={restart}>从头播放</button>
        <button class="icon-btn sm" type="button" title="知道了" onclick={() => (resumedAt = 0)}><Icon name="x" size={13} /></button>
      </span>
    {/if}
    <span class="spacer"></span>
    {#if tracks.length}
      <button
        class="btn btn-ghost btn-sm"
        class:on={shownTrack >= 0}
        type="button"
        title={tracks.length > 1 ? "切换字幕" : "字幕开关"}
        onclick={cycleTrack}
      >
        <Icon name="captions" size={15} />{shownTrack >= 0 ? tracks[shownTrack].label : "字幕关"}
      </button>
    {/if}
    <button class="btn btn-ghost btn-sm num" type="button" title="播放速度" onclick={cycleRate}>{rate}×</button>
  </div>
</div>

<style>
  .vp {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-2);
    width: 100%;
    outline: none;
  }

  /* Fill the available width (small sources scale up), never taller than the view. */
  video {
    display: block;
    width: 100%;
    height: auto;
    max-height: calc(100% - 44px);
    border-radius: var(--r-sm);
    background: black;
  }

  .pane video {
    box-shadow: var(--shadow-2);
  }

  .full video {
    max-height: calc(100dvh - 160px);
  }

  video::cue {
    background: oklch(0 0 0 / 0.55);
    font-family: var(--font);
    line-height: 1.4;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: var(--s-1);
    width: 100%;
    min-height: var(--h-sm);
    color: var(--text-2);
    font-size: var(--fs-2);
  }

  .spacer {
    flex: 1;
  }

  .resume {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    padding-left: var(--s-1);
    animation: fade-in var(--t-3) var(--ease);
  }

  .link {
    color: var(--accent-text);
    font-size: var(--fs-2);
  }

  .link:hover {
    text-decoration: underline;
  }

  .on {
    color: var(--accent-text);
  }
</style>
