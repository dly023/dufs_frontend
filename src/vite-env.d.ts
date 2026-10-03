/// <reference types="svelte" />
/// <reference types="vite/client" />

interface Window {
  __INITIAL_DATA__?: import("./lib/dufs/types").DufsData;
}
