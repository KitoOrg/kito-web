<script>
  // Every note left on code: what there is to know that no change says.
  import { ask, ago, whyLink } from './api.js';
  import Empty from './Empty.svelte';
  import Loading from './Loading.svelte';

  let notes = $state(null);
  let failed = $state('');
  let on = $state('');
  let text = $state('');
  let busy = $state(false);

  async function load() {
    try {
      notes = await ask('notes');
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function act(what) {
    busy = true;
    failed = '';
    try {
      await what();
      await load();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }
  const leave = () =>
    act(async () => {
      await ask('add_note', { on: on.trim(), text });
      [on, text] = ['', ''];
    });
  const remove = (id) => act(() => ask('remove_note', { note: id }));
  // A directory is no page of its own.
  const link = (target) => (target.endsWith('/') ? null : whyLink(target));
</script>

<div class="page-head">
  <div>
    <h1>Notes</h1>
    <p class="lead">
      What whoever changes some code must know, and no change of the code says. A note is told with the why of that code,
      and to an agent before it changes it.
    </p>
  </div>
</div>

{#if failed}<p class="error">{failed}</p>{/if}

{#if notes === null && !failed}
  <Loading />
{:else if notes?.length === 0}
  <div class="gap"><Empty title="No note is left on this repository's code.">Leave one below: it is told to whoever changes that code.</Empty></div>
{:else}
  <ul>
    {#each notes ?? [] as note (note.id)}
      <li class="panel">
        <p class="on">
          {#if link(note.on)}<a class="mono" href={link(note.on)}>{note.on}</a>{:else}<span class="mono">{note.on}</span>{/if}
          {#if note.gone}<span class="chip warn">on a function that no longer exists</span>{/if}
        </p>
        <p class="text">{note.text}</p>
        <p class="soft small">
          {note.id} · {note.by}{#if note.for}, of {note.for}{/if} · {ago(note.at_ms)}
          <button class="quiet sm" disabled={busy} onclick={() => remove(note.id)}>Remove</button>
        </p>
      </li>
    {/each}
  </ul>
{/if}

<form
  class="panel new"
  onsubmit={(event) => {
    event.preventDefault();
    leave();
  }}
>
  <h2>Leave a note</h2>
  <input
    class="mono"
    bind:value={on}
    placeholder="On what: src/billing.ts:invoice, src/billing.ts, src/billing/ or src/billing.ts:12"
    aria-label="What the note is on"
  />
  <textarea bind:value={text} placeholder="Called by the nightly billing job, outside this repository: do not rename." aria-label="The note"
  ></textarea>
  <div><button class="primary" disabled={busy || on.trim() === '' || text.trim().length < 3}>Leave the note</button></div>
</form>

<style>
  ul {
    list-style: none;
    margin: 0 0 24px;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    padding: 12px 16px;
    font-size: 13px;
  }
  p {
    margin: 0;
  }
  .on {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .text {
    margin: 4px 0;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .small {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    font-size: 12.5px;
  }
  .gap {
    margin-bottom: 24px;
  }
  .new {
    padding: 16px;
    display: grid;
    gap: 10px;
    max-width: 720px;
  }
</style>
