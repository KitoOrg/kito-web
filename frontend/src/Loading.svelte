<script>
  // While something is asked for: a few grey lines where it will be.
  let { lines = 3, label = 'Loading…', inset = false } = $props();
</script>

<div class="loading" class:inset role="status" aria-live="polite">
  <span class="sr">{label}</span>
  {#each Array.from({ length: lines }) as _, at}
    <span class="bar" style:width={`${[92, 74, 58, 84, 66][at % 5]}%`} aria-hidden="true"></span>
  {/each}
</div>

<style>
  .loading {
    display: grid;
    gap: 10px;
    padding: 4px 0;
    max-width: var(--narrow);
  }
  .loading.inset {
    padding: var(--pad-panel);
  }
  .bar {
    display: block;
    height: 10px;
    border-radius: var(--radius);
    background: linear-gradient(90deg, var(--line) 0%, var(--hover) 50%, var(--line) 100%);
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none;
    }
  }
</style>
