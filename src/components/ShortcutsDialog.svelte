<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
  }
  let { open, onClose }: Props = $props();

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";

  const groups: { title: string; items: { keys: string[]; desc: string }[] }[] = [
    {
      title: "导航",
      items: [
        { keys: ["/"], desc: "搜索" },
        { keys: [mod, "K"], desc: "跳转 / 命令" },
        { keys: ["⌫"], desc: "返回上级目录" },
        { keys: ["R"], desc: "刷新" },
      ],
    },
    {
      title: "选择",
      items: [
        { keys: [mod, "A"], desc: "全选" },
        { keys: ["⇧", "点击"], desc: "连续选择" },
        { keys: [mod, "点击"], desc: "加选" },
        { keys: ["Del"], desc: "移入回收站" },
        { keys: ["Esc"], desc: "逐层退出" },
      ],
    },
    {
      title: "查看",
      items: [
        { keys: ["Space"], desc: "侧栏预览选中项" },
        { keys: ["双击"], desc: "全屏查看" },
        { keys: ["←", "→"], desc: "上一个 / 下一个" },
        { keys: ["F"], desc: "图片全屏" },
      ],
    },
    {
      title: "图片与条漫",
      items: [
        { keys: ["滚轮"], desc: "缩放图片" },
        { keys: ["拖动"], desc: "左右滑动翻页" },
        { keys: ["Space"], desc: "条漫翻一屏" },
        { keys: ["?"], desc: "显示本帮助" },
      ],
    },
  ];

  /** Pull focus into the dialog on open (keys stop reaching the page behind). */
  function grabFocus(node: HTMLElement) {
    requestAnimationFrame(() => node.focus({ preventScroll: true }));
  }
</script>

<svelte:window onkeydowncapture={(e) => { if (open && e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onClose(); } }} />

{#if open}
  <div class="modal">
    <button type="button" class="modal-backdrop" tabindex="-1" aria-label="关闭" onclick={onClose}></button>
    <div tabindex="-1" use:grabFocus class="modal-card shortcuts-card" role="dialog" aria-modal="true" aria-label="快捷键">
      <div class="modal-head">
        <h2>快捷键</h2>
        <button class="icon-btn sm" type="button" title="关闭 (Esc)" onclick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <div class="groups">
        {#each groups as g}
          <section>
            <h3>{g.title}</h3>
            <ul>
              {#each g.items as it}
                <li>
                  <span class="desc">{it.desc}</span>
                  <span class="keys">
                    {#each it.keys as k, i}
                      
                      <kbd class="kbd">{k}</kbd>
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .shortcuts-card {
    width: min(620px, 100%);
  }

  .groups {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-5) var(--s-6);
    max-height: 64vh;
    overflow: auto;
  }

  h3 {
    margin-bottom: var(--s-2);
    color: var(--text-3);
    font-size: var(--fs-1);
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 30px;
    font-size: var(--fs-3);
  }

  .desc {
    color: var(--text-2);
  }

  .keys {
    display: flex;
    gap: 4px;
  }

  .keys :global(.kbd) {
    min-width: 22px;
    height: 22px;
    font-size: var(--fs-1);
  }

  @media (max-width: 560px) {
    .groups {
      grid-template-columns: 1fr;
    }
  }
</style>
