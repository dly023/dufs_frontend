<script lang="ts">
  import { ICONS, type IconName } from "../lib/icons";

  interface Props {
    name: IconName;
    size?: number;
    stroke?: number;
    /** Solid shape (e.g. an active star). */
    fill?: boolean;
  }
  let { name, size = 16, stroke = 1.75, fill = false }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={fill ? "currentColor" : "none"}
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true">{@html ICONS[name]}</svg>
