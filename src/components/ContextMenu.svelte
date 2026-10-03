<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { directory } from "../stores/directory.svelte";
  import { isImageExt, isNovelPreviewExt } from "../lib/models/exts";
  import { isEditable, isPreviewable } from "../lib/models/preview";
  import { navigateTo } from "../actions/navigate";
  import { ensureTrailingSlash } from "../lib/models/path";
  import { actionDeleteItems, actionMoveItems, actionRename, copyText } from "../actions/files";
  import { getToken } from "../lib/dufs/client";
  import { toasts } from "../stores/toast.svelte";
  import { auth } from "../stores/auth.svelte";

  /**
   * dufs token links let an external downloader (curl / aria2 / 迅雷) fetch a
   * protected file without sharing the password. The server only issues a token
   * when auth is enabled and the caller is logged in; otherwise dufs answers 500.
   */
  async function copyToken(target: PathItem) {
    const plain = `${location.origin}${target.fullpath}${target.is_dir ? "/?zip" : ""}`;
    try {
      const token = (await getToken(target.fullpath, target.is_dir)).trim();
      if (!token || token.length < 16) throw new Error("no-token");
      const suffix = target.is_dir
        ? `?zip&token=${encodeURIComponent(token)}`
        : `?token=${encodeURIComponent(token)}`;
      await copyText(`${location.origin}${target.fullpath}${suffix}`);
    } catch {
      await copyText(plain);
      toasts.warning("服务端未启用鉴权或未登录：token 链接不可用，已复制普通链接");
    }
  }

  interface Props {
    item: PathItem;
    x: number;
    y: number;
    onClose: () => void;
    onPreview: (item: PathItem) => void;
    onFullPreview?: (item: PathItem) => void;
    onEdit?: (item: PathItem) => void;
    onShare?: (item: PathItem) => void;
    onComic?: (item: PathItem) => void;
  }
  let { item, x, y, onClose, onPreview, onFullPreview, onEdit, onShare, onComic }: Props = $props();

  let menuEl = $state<HTMLDivElement>();
  let pos = $state({ left: -9999, top: -9999, origin: "top left" });

  // Measure once mounted, then flip away from the edges it would overflow.
  $effect(() => {
    if (!menuEl) return;
    const { width, height } = menuEl.getBoundingClientRect();
    const flipX = x + width > innerWidth - 8;
    const flipY = y + height > innerHeight - 8;
    pos = {
      left: Math.max(8, flipX ? x - width : x),
      top: Math.max(8, flipY ? y - height : y),
      origin: `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}`,
    };
  });

  const isMedia = $derived(!item.is_dir && (isImageExt(item.ext) || isPreviewable(item)));

  function run(fn: () => void) {
    fn();
    onClose();
  }

  function openComic() {
    onComic?.(item);
    onClose();
  }
</script>

<button type="button" class="click-away" tabindex="-1" aria-label="关闭菜单" onclick={onClose} oncontextmenu={(e) => (e.preventDefault(), onClose())}></button>
<div
  class="menu"
  role="menu"
  bind:this={menuEl}
  style:left={`${pos.left}px`}
  style:top={`${pos.top}px`}
  style:--origin={pos.origin}
>
  <div class="menu-label ellipsis" title={item.name}>{item.filename}</div>
  {#if item.is_dir}
    <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => navigateTo(ensureTrailingSlash(`${item.fullpath}/`)))}>
      <Icon name="folder" />打开
    </button>
  {:else if isMedia}
    <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => onPreview(item))}>
      <Icon name="sidebar" />在侧栏预览<span class="hint">单击</span>
    </button>
    <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => onFullPreview?.(item))}>
      <Icon name="expand" />全屏查看<span class="hint">双击</span>
    </button>
  {/if}
  {#if item.is_dir || isNovelPreviewExt(item.ext)}
    <button
      class="menu-item"
      type="button"
      role="menuitem"
      title={item.is_dir ? "按顺序连读这个文件夹（含子目录）的图片" : "把文本按段落排成条漫阅读"}
      onclick={openComic}
    >
      <Icon name="bookOpen" />阅读
    </button>
  {/if}
  {#if isEditable(item) && directory.allowUpload}
    <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => onEdit?.(item))}>
      <Icon name="edit" />编辑
    </button>
  {/if}

  <div class="menu-sep"></div>
  <a
    class="menu-item"
    role="menuitem"
    href={item.is_dir ? `${item.fullpath}/?zip` : item.fullpath}
    download={item.is_dir ? `${item.filename}.zip` : item.filename}
    onclick={onClose}
  >
    <Icon name="download" />{item.is_dir ? "打包下载" : "下载"}
  </a>
  {#if !item.is_dir}
    <a class="menu-item" role="menuitem" href={item.fullpath} target="_blank" rel="noopener noreferrer" onclick={onClose}>
      <Icon name="external" />新标签页打开
    </a>
  {/if}

  <div class="menu-sep"></div>
  <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => void copyText(`${location.origin}${item.fullpath}${item.is_dir ? "/" : ""}`))}>
    <Icon name="link" />复制链接
  </button>
  <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => void copyText(decodeURIComponent(item.fullpath)))}>
    <Icon name="copy" />复制路径
  </button>
  {#if auth.isAuthed || directory.authRequired}
    <button class="menu-item" type="button" role="menuitem" title="给 curl / aria2 等下载器用的免密链接" onclick={() => run(() => void copyToken(item))}>
      <Icon name="link" />复制免密下载链接
    </button>
  {/if}
  <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => onShare?.(item))}>
    <Icon name="qr" />二维码分享
  </button>

  {#if directory.allowUpload || directory.allowDelete}
    <div class="menu-sep"></div>
  {/if}
  {#if directory.allowUpload}
    <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => void actionRename(item))}>
      <Icon name="edit" />重命名
    </button>
    <button class="menu-item" type="button" role="menuitem" onclick={() => run(() => void actionMoveItems([item]))}>
      <Icon name="move" />移动到…
    </button>
  {/if}
  {#if directory.allowDelete}
    <button class="menu-item is-danger" type="button" role="menuitem" onclick={() => run(() => void actionDeleteItems([item]))}>
      <Icon name="trash" />删除<span class="hint">Del</span>
    </button>
  {/if}
</div>
