<script>
  // Every note left on code: what there is to know that no change says.
  import { ask, focus, mayWrite, whyLink } from './api.js';
  import { who } from './format.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  // `role`: what the reader may do in this repository, behind a server.
  let { role = undefined } = $props();
  const may = $derived(mayWrite(role));

  let notes = $state(null);
  let failed = $state('');
  // A note to add: what it is on, and what it says.
  let adding = $state(false);
  let on = $state('');
  let text = $state('');
  let busy = $state(false);
  let addFailed = $state('');
  // The note that could not be removed, and why: said in its own row.
  let removeFailed = $state({ id: '', message: '' });

  async function load() {
    try {
      notes = await ask('notes');
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function add() {
    busy = true;
    addFailed = '';
    try {
      await ask('add_note', { on: on.trim(), text });
      [on, text, adding] = ['', '', false];
      toast('Note added');
      await load();
    } catch (error) {
      addFailed = error.message;
    } finally {
      busy = false;
    }
  }
  async function remove(note) {
    removeFailed = { id: '', message: '' };
    try {
      await ask('remove_note', { note: note.id });
      toast('Note removed');
      await load();
    } catch (error) {
      removeFailed = { id: note.id, message: error.message };
    }
  }
  // A directory is no page of its own.
  const link = (target) => (target.endsWith('/') ? null : whyLink(target));
</script>

{#snippet adder()}
  <button class="primary" disabled={adding} onclick={() => (adding = true)}>Add note</button>
{/snippet}

<PageHead title="Notes" docs="notes" actions={may ? adder : null} />

{#if adding}
  <form
    class="panel pad narrow form"
    onsubmit={(event) => {
      event.preventDefault();
      add();
    }}
  >
    <h3>Add note</h3>
    <label class="field">
      <span>On</span>
      <input class="mono" bind:value={on} placeholder="src/billing.ts:invoice" use:focus />
      <span class="hint">A function, a file, a directory, or a line of a file.</span>
    </label>
    <label class="field">
      <span>Note</span>
      <textarea bind:value={text} placeholder="Called by the nightly billing job, outside this repository: do not rename."></textarea>
    </label>
    <div class="controls">
      <button class="primary" disabled={busy || on.trim() === '' || text.trim() === ''}>{busy ? 'Adding…' : 'Add'}</button>
      <button type="button" class="quiet" onclick={() => (adding = false)}>Cancel</button>
    </div>
    <Err message={addFailed} />
  </form>
{/if}

{#if failed}
  <Err message={failed} />
{:else if notes === null}
  <Loading />
{:else if notes.length === 0}
  <Empty title="No notes yet" />
{:else}
  <ul class="panel rows">
    {#each notes as note (note.id)}
      <li>
        <div class="row">
          <div class="row-body">
            <p class="said">{note.text}</p>
            <p class="row-meta">
              {#if link(note.on)}<a class="ref" href={link(note.on)}>{note.on}</a>{:else}<span class="ref">{note.on}</span>{/if}{#if note.gone},
                a function that no longer exists{/if}
              · {who(note.by, note.for)} · <Time ms={note.at_ms} /> · <span class="mono">{note.id}</span>
            </p>
            <Err message={removeFailed.id === note.id ? removeFailed.message : ''} />
          </div>
          {#if may}
            <div class="row-side">
              <Confirm
                label="Remove"
                ask={`Remove the note on ${note.on}? Whoever changes that code is no longer told it.`}
                working="Removing…"
                sm
                onyes={() => remove(note)}
              />
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}
