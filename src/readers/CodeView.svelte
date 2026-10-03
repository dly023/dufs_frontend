<script lang="ts">
  import type { PathItem } from "../lib/dufs/types";

  interface Props {
    item: PathItem;
    text: string;
    variant: "pane" | "full";
  }
  let { text }: Props = $props();
</script>

<pre class="doc mono-block">{text}</pre>

<style>
  .doc {
    align-self: stretch;
    padding: var(--s-4);
  }
</style>
