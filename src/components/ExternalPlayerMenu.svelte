<script lang="ts">
  import Dropdown from "./Dropdown.svelte";
  import Icon from "./Icon.svelte";
  import { playerList, playerSchemeUrl, mpvCommand, vlcCommand, m3uBlobUrl, playlistName } from "../lib/media/externalPlayer";
  import { copyText } from "../actions/files";

  interface Props {
    /** Absolute URL of the current media file. */
    url: string;
    /** Sibling playlist (same-dir audio/video); empty = single track only. */
    playlist?: { name: string; url: string }[];
    /** Download filename base for the playlist. */
    playlistBase?: string;
    size?: number;
  }
  let { url, playlist = [], playlistBase = "playlist", size = 16 }: Props = $props();

  function openScheme(schemeUrl: string) {
    location.href = schemeUrl;
  }

  async function copy(label: string, text: string) {
    await copyText(text);
  }

  function downloadPlaylist() {
    const list = playlist.length ? playlist : [{ name: playlistBase, url }];
    const blob = m3uBlobUrl(list);
    const a = document.createElement("a");
    a.href = blob.url;
    a.download = playlistName(playlistBase);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(blob.revoke, 30_000);
  }
</script>

<Dropdown title="在外部播放器打开" width={230}>
  {#snippet trigger()}
    <Icon name="external" {size} />
  {/snippet}
  {#snippet children(close)}
    {#each playerList as p (p.id)}
      {@const su = playerSchemeUrl(p, url)}
      {#if su}
        <button class="menu-item" type="button" role="menuitem" onclick={() => { openScheme(su); close(); }}>
          <Icon name="external" size={15} />
          {p.label}
        </button>
      {/if}
    {/each}
    <div class="menu-sep" role="separator"></div>
    <button class="menu-item" type="button" role="menuitem" onclick={() => { void copy("mpv", mpvCommand(url)); close(); }}>
      <Icon name="copy" size={15} />
      复制 mpv 命令
    </button>
    <button class="menu-item" type="button" role="menuitem" onclick={() => { void copy("vlc", vlcCommand(url)); close(); }}>
      <Icon name="copy" size={15} />
      复制 VLC 命令
    </button>
    <div class="menu-sep" role="separator"></div>
    <button class="menu-item" type="button" role="menuitem" onclick={() => { downloadPlaylist(); close(); }}>
      <Icon name="download" size={15} />
      下载 M3U 播放列表{#if playlist.length}（{playlist.length} 首）{/if}
    </button>
  {/snippet}
</Dropdown>
