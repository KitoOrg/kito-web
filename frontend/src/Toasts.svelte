<script>
  import { dismiss, toasts } from './toast.svelte.js';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as one (one.id)}
    <div class="toast {one.tone}">
      <span class="dot" aria-hidden="true"></span>
      <span class="text">{one.text}</span>
      <button class="bare close" aria-label="Dismiss" onclick={() => dismiss(one.id)}>✕</button>
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
    font-size: 13px;
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
    color: var(--faint);
    font-size: 11px;
    padding: 2px 4px;
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
