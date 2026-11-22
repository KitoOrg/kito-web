<script>
  // A button for what cannot be taken back: pressed, it asks first, in
  // the page, in the words of what will happen and with the button's own
  // verb. `typed`: a word the person has to type before it goes on (the
  // name of what is deleted).
  import { tick } from 'svelte';

  let {
    label,
    ask,
    yes = label,
    onyes,
    sm = false,
    quiet = true,
    danger = true,
    primary = false,
    disabled = false,
    typed = null,
    working = '',
  } = $props();

  let open = $state(false);
  let entered = $state('');
  let busy = $state(false);
  let at = $state({ top: 0, left: 0, width: 300 });
  let trigger = $state(null);
  let pop = $state(null);

  async function show() {
    const box = trigger.getBoundingClientRect();
    const width = Math.min(300, innerWidth - 24);
    const left = Math.max(12, Math.min(box.right - width, innerWidth - width - 12));
    at = { top: box.bottom + 6, left, width };
    entered = '';
    open = true;
    await tick();
    // Above the button when there is no room under it.
    const height = pop?.offsetHeight ?? 0;
    if (at.top + height > innerHeight - 12 && box.top - 6 - height > 12) at = { ...at, top: box.top - 6 - height };
    pop?.querySelector(typed ? 'input' : '.cancel')?.focus();
  }
  function hide() {
    open = false;
  }

  $effect(() => {
    if (!open) return;
    const away = (event) => {
      if (!pop?.contains(event.target) && !trigger?.contains(event.target)) hide();
    };
    const key = (event) => {
      if (event.key !== 'Escape') return;
      hide();
      trigger?.focus();
    };
    const moved = (event) => {
      if (!pop?.contains(event.target)) hide();
    };
    addEventListener('mousedown', away);
    addEventListener('keydown', key);
    addEventListener('scroll', moved, true);
    addEventListener('resize', hide);
    return () => {
      removeEventListener('mousedown', away);
      removeEventListener('keydown', key);
      removeEventListener('scroll', moved, true);
      removeEventListener('resize', hide);
    };
  });

  async function go() {
    hide();
    busy = true;
    try {
      await onyes?.();
    } finally {
      busy = false;
    }
  }
</script>

<button
  bind:this={trigger}
  type="button"
  class={[sm && 'sm', quiet && !primary && 'quiet', danger && 'danger', primary && 'primary']}
  disabled={disabled || busy}
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={() => (open ? hide() : show())}>{busy && working ? working : label}</button
>
{#if open}
  <div
    bind:this={pop}
    class="panel ask"
    role="dialog"
    aria-label={ask}
    style:top={`${at.top}px`}
    style:left={`${at.left}px`}
    style:width={`${at.width}px`}
  >
    <p>{ask}</p>
    {#if typed}
      <label class="field">
        <span>Type <span class="mono">{typed}</span> to go on</span>
        <input bind:value={entered} autocomplete="off" spellcheck="false" />
      </label>
    {/if}
    <div class="controls">
      <button type="button" class={['sm', danger ? 'danger' : 'primary']} disabled={typed !== null && entered !== typed} onclick={go}
        >{yes}</button
      >
      <button type="button" class="sm quiet" onclick={hide}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .ask {
    position: fixed;
    z-index: 60;
    display: grid;
    gap: 10px;
    padding: 12px;
    box-shadow: var(--menu-shadow);
    white-space: normal;
    text-align: left;
    font-size: 13px;
    font-weight: 400;
    color: var(--ink);
  }
</style>
