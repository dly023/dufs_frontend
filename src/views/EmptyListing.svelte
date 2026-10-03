<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import { directory } from "../stores/directory.svelte";
  import { prefs, type TypeFilter } from "../stores/prefs.svelte";
  import { localFilter } from "../stores/filter.svelte";

  /** Shared by all three views: says *why* nothing is shown and offers the way out. */
  const FILTER_NOUN: Record<TypeFilter, string> = {
    all: "",
    image: "图片",
    video: "视频",
    audio: "音频",
    document: "文档",
    archive: "压缩包",
    code: "代码",
  };

  const filtered = $derived(prefs.typeFilter !== "all");
  const hasLocalFilter = $derived(!!localFilter.query.trim());

  function switchScope() {
    prefs.toggleSearchScope();
    void directory.runSearch(directory.search, prefs.searchScope);
  }
</script>

<div class="empty">
  {#if hasLocalFilter}
    <span class="empty-icon"><Icon name="filter" size={22} /></span>
    <strong>没有匹配「{localFilter.query.trim()}」的文件</strong>
    <p>当前目录里的文件已被快速筛选过滤。</p>
    <div class="empty-actions">
      <button class="btn" type="button" onclick={() => localFilter.clear()}>清除筛选</button>
    </div>
  {:else if directory.search}
    <span class="empty-icon"><Icon name="search" size={22} /></span>
    <strong>没有找到「{directory.search}」</strong>
    {#if prefs.searchScope === "folder"}
      <p>只在当前目录里找过，可以扩大到全站再试。</p>
      <div class="empty-actions">
        <button class="btn" type="button" onclick={switchScope}>搜索全站</button>
      </div>
    {:else}
      <p>全站都没有匹配的文件，换个关键词试试。</p>
    {/if}
  {:else if filtered}
    <span class="empty-icon"><Icon name="filter" size={22} /></span>
    <strong>没有「{FILTER_NOUN[prefs.typeFilter]}」类型的文件</strong>
    <p>当前目录里的其他文件被筛选隐藏了。</p>
    <div class="empty-actions">
      <button class="btn" type="button" onclick={() => prefs.setTypeFilter("all")}>清除筛选</button>
    </div>
  {:else}
    <span class="empty-icon"><Icon name="folder" size={22} /></span>
    <strong>这里还是空的</strong>
    <p>{directory.allowUpload ? "把文件拖到窗口任意位置即可上传，也可以直接粘贴图片。" : "这个目录没有任何文件。"}</p>
  {/if}
</div>
