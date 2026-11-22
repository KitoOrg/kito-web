<script>
  // A text that is read, and written by whoever may: a part of a kitchen,
  // an instruction. First as it reads — Markdown rendered, anything else
  // as it is written — with "Edit" at its head; then the text itself,
  // with a look at how it will read, "Save" and "Cancel". What saving
  // does is the page's own: here is only how a text is read and written,
  // the same wherever there is one. An Editor is for one text: a page
  // that shows another makes another (`{#key}`).
  import { tick } from 'svelte';
  import { focus } from './api.js';
  import { markdown } from './md.js';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';

  // `name`: what the text is called (`mono`: it is a path). `text`: as it
  // is now. `editable`: the reader may change it. `fresh`: it is new, so
  // it is written from the start, can be saved as it is, and leaving it
  // is the page's to do (`oncancel`). `onsave(text)` saves it, and throws
  // when it could not. `onremove` takes it away: asked first, on a button
  // `removeLabel`, in the words of `removeAsk`. `hint`: what saving
  // means, a string or a snippet. `head`: more for the head, after its
  // own buttons. `fields`: the page's own fields, between the text and
  // "Save".
  let {
    name,
    mono = false,
    text = '',
    editable = false,
    fresh = false,
    onsave,
    oncancel = null,
    onremove = null,
    removeLabel = 'Remove',
    removeAsk = '',
    hint = null,
    head = null,
    fields = null,
  } = $props();

  let editing = $state(false);
  let writing = $derived(fresh || editing);
  // What was typed over the text (null: nothing yet), and so what would be saved.
  let typed = $state(null);
  let draft = $derived(typed ?? text);
  // While it is written: the text, or how it will read.
  let showing = $state('text');
  let busy = $state(false);
  let failed = $state('');

  let isMarkdown = $derived(name.endsWith('.md'));
  // Nothing to save until something changed; a new text is a change already.
  let changed = $derived(draft.trim() !== '' && (fresh || draft !== text));

  function edit() {
    typed = null;
    showing = 'text';
    failed = '';
    editing = true;
  }

  // Back to reading, with the cursor where writing started.
  let opener = $state(null);
  async function leave() {
    editing = false;
    typed = null;
    await tick();
    opener?.focus();
  }

  // A new text has nothing to go back to: what comes after it is the page's to say.
  function cancel() {
    failed = '';
    if (fresh) oncancel?.();
    else leave();
  }

  async function save(event) {
    event.preventDefault();
    // Asked now: once it is saved, the page may have put this text away.
    const back = !fresh;
    busy = true;
    failed = '';
    try {
      await onsave(draft);
      if (back) leave();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }

  async function remove() {
    busy = true;
    failed = '';
    try {
      await onremove();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="panel editor">
  <div class="panel-head">
    <h3 class={[mono && 'mono']}>{name}</h3>
    <span class="grow"></span>
    {#if writing && isMarkdown}
      <div class="seg" role="group" aria-label="Text or preview">
        <button type="button" aria-pressed={showing === 'text'} onclick={() => (showing = 'text')}>Text</button>
        <button type="button" aria-pressed={showing === 'preview'} onclick={() => (showing = 'preview')}>Preview</button>
      </div>
    {:else if !writing && editable}
      <button bind:this={opener} class="sm" onclick={edit}>Edit</button>
    {/if}
    {@render head?.()}
  </div>
  {#if writing}
    <form class="pad stack" onsubmit={save}>
      {#if showing === 'text' || !isMarkdown}
        <textarea
          class="mono"
          rows="18"
          bind:value={() => draft, (value) => (typed = value)}
          aria-label={`The text of ${name}`}
          spellcheck="false"
          use:focus
        ></textarea>
      {:else}
        <div class="rendered preview">{@html markdown(draft)}</div>
      {/if}
      {@render fields?.()}
      <div class="box">
        <div class="controls">
          <button class="primary" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" class="quiet" disabled={busy} onclick={cancel}>Cancel</button>
          <span class="grow"></span>
          {#if onremove}<Confirm label={removeLabel} ask={removeAsk} onyes={remove} disabled={busy} />{/if}
        </div>
        <Err message={failed} />
        {#if typeof hint === 'string'}
          <p class="hint">{hint}</p>
        {:else if hint}
          <p class="hint">{@render hint()}</p>
        {/if}
      </div>
    </form>
  {:else if text.trim() === ''}
    <Empty inset title="No text in it" />
  {:else if isMarkdown}
    <div class="rendered pad">{@html markdown(text)}</div>
  {:else}
    <div class="pad"><pre>{text}</pre></div>
  {/if}
</section>

<style>
  /* Wherever it stands, a long line of code scrolls inside it and never makes it wider. */
  .editor {
    min-width: 0;
  }
  /* How it will read: a long one scrolls in its own box. */
  .preview {
    max-height: 60vh;
    overflow: auto;
  }
</style>
