<script>
  // Where there is nothing to show: what is not there, and one line why.
  // `inset`: already inside a panel, so no border of its own.
  let { title = 'Nothing yet', inset = false, children } = $props();
</script>

<div class="empty" class:panel={!inset} class:inset>
  <p class="title">{title}</p>
  {#if children}
    <div class="why">{@render children()}</div>
  {/if}
</div>

<style>
  .empty {
    padding: 28px 24px;
    text-align: center;
  }
  .empty.inset {
    padding: 20px 16px;
  }
  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .why {
    margin: 4px auto 0;
    max-width: 520px;
    color: var(--soft);
    font-size: 13px;
  }
  .why :global(p) {
    margin: 0 0 4px;
  }
  .why :global(p:last-child) {
    margin: 0;
  }
</style>
