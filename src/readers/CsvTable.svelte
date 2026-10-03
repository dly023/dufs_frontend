<script lang="ts">
  import type { CsvResult } from "../lib/highlight/csv";

  interface Props {
    data: CsvResult;
    maxRows: number;
    variant: "pane" | "full";
  }
  let { data, maxRows, variant }: Props = $props();

  const header = $derived(data.rows[0] ?? []);
  const body = $derived(data.rows.slice(1));
  const cols = $derived(Array.from({ length: data.columns }, (_, i) => i));
</script>

<div class="csv-scroll {variant}">
  <table>
    <thead>
      <tr>
        <th class="rn" aria-label="行号"></th>
        {#each cols as c (c)}
          <th class:num={data.numeric[c]} title={header[c]}>{header[c] ?? ""}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each body as r, i (i)}
        <tr>
          <td class="rn">{i + 1}</td>
          {#each cols as c (c)}
            {@const v = r[c] ?? ""}
            <td class:num={data.numeric[c]} title={v.length > 32 || v.includes("\n") ? v : undefined}>{v}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
{#if data.capped}
  <p class="note num">仅显示前 {maxRows.toLocaleString()} 行，下载可查看全部。</p>
{/if}

<style>
  .csv-scroll {
    max-height: min(72vh, 720px);
    overflow: auto;
    border-radius: var(--r-sm);
    box-shadow: inset 0 0 0 1px var(--border);
    overscroll-behavior: contain;
  }

  .csv-scroll.pane {
    max-height: calc(100dvh - 240px);
  }

  table {
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: var(--fs-2);
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    max-width: 32ch;
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--fill);
    color: var(--text);
    font-weight: 600;
  }

  td {
    background: var(--surface);
    color: var(--text-2);
  }

  tbody tr:hover td {
    background: color-mix(in oklch, var(--surface), var(--fill) 60%);
  }

  .num {
    text-align: right;
  }

  /* Row numbers stay put while the columns scroll sideways. */
  .rn {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 3ch;
    padding-right: 8px;
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: var(--fs-1);
    text-align: right;
    user-select: none;
    box-shadow: inset -1px 0 0 var(--border);
  }

  th.rn {
    z-index: 2;
  }

  .note {
    margin-top: var(--s-2);
    color: var(--text-3);
    font-size: var(--fs-2);
  }
</style>
