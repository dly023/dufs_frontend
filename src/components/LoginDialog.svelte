<script lang="ts">
  import Icon from "./Icon.svelte";
  import { directory } from "../stores/directory.svelte";
  import { auth } from "../stores/auth.svelte";
  import { toasts } from "../stores/toast.svelte";
  import { DufsHttpError, invalidateDirectoryCache } from "../lib/dufs/client";
  import { folderProbes } from "../stores/folderProbe.svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
  }
  let { open, onClose }: Props = $props();
  let user = $state("");
  let pass = $state("");
  let busy = $state(false);
  let error = $state("");
  let userEl = $state<HTMLInputElement>();
  let passEl = $state<HTMLInputElement>();

  // Land in the first empty field so typing works right away.
  $effect(() => {
    if (!open) return;
    requestAnimationFrame(() => (user.trim() ? passEl : userEl)?.focus());
  });

  async function submit() {
    if (!user.trim() || busy) return;
    busy = true;
    error = "";
    try {
      const name = await auth.login(user.trim(), pass);
      invalidateDirectoryCache();
      folderProbes.reset();
      toasts.success(`已登录 ${name}`);
      pass = "";
      onClose();
      await directory.load(directory.path, undefined, { skipCache: true });
    } catch (e) {
      const msg =
        e instanceof DufsHttpError && (e.status === 401 || e.status === 403)
          ? "用户名或密码错误"
          : e instanceof Error
            ? e.message
            : "登录失败";
      error = msg;
      toasts.error(msg);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydowncapture={(e) => { if (open && e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onClose(); } }} />

{#if open}
  <div class="modal">
    <button type="button" class="modal-backdrop" tabindex="-1" aria-label="关闭" onclick={onClose}></button>
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="登录">
      <div class="modal-head">
        <h2>登录</h2>
        <button class="icon-btn sm" type="button" title="关闭 (Esc)" onclick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <label class="field">
        <span>用户名</span>
        <input class="input" bind:this={userEl} bind:value={user} autocomplete="username" onkeydown={(e) => e.key === "Enter" && passEl?.focus()} />
      </label>
      <label class="field">
        <span>密码</span>
        <input class="input" type="password" bind:this={passEl} bind:value={pass} autocomplete="current-password" onkeydown={(e) => e.key === "Enter" && submit()} />
      </label>
      {#if error}
        <p class="login-error" role="alert">{error}</p>
      {/if}
      <div class="modal-actions">
        <button type="button" class="btn" onclick={onClose}>取消</button>
        <button type="button" class="btn btn-primary" disabled={busy} onclick={submit}>{busy ? "…" : "登录"}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .login-error {
    margin-top: calc(var(--s-2) * -1);
    color: var(--danger);
    font-size: var(--fs-2);
  }
</style>
