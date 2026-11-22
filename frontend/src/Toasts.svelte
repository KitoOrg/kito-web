<script>
  import { dismiss, toasts } from './toast.svelte.js';
  import Icon from './Icon.svelte';
  import { shell } from './shell.svelte.js';
</script>

<!-- Over what is stuck to the foot of the window, never on it. -->
<div class="toasts" role="status" aria-live="polite" style:bottom={shell.foot > 0 ? `${shell.foot + 12}px` : null}>
  {#each toasts as one (one.id)}
    <div class="toast {one.tone}">
      <span class="dot" aria-hidden="true"></span>
      <span class="text">{one.text}</span>
      <button class="bare close" aria-label="Dismiss" onclick={() => dismiss(one.id)}><Icon name="close" size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 50;
    display: grid;
    gap: 8px;
    justify-items: end;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-panel);
    background: var(--panel);
    color: var(--ink);
    box-shadow: var(--menu-shadow);
    pointer-events: auto;
    animation: rise 0.16s ease-out;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ok);
    flex: none;
  }
  .warn .dot {
    background: var(--warn);
  }
  .bad .dot {
    background: var(--bad);
  }
  .text {
    overflow-wrap: anywhere;
  }
  .close {
    display: inline-grid;
    place-items: center;
    color: var(--faint);
    padding: 2px;
    cursor: pointer;
  }
  .close:hover {
    color: var(--ink);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
  @media (max-width: 640px) {
    .toasts {
      left: 12px;
      right: 12px;
      bottom: 12px;
      justify-items: stretch;
    }
    .toast {
      max-width: none;
    }
  }
</style>
