<script>
  // What the assistants are told in a repository (Kito 0.32): the
  // kitchen's instructions and the repository's own, each with where it
  // comes from; what each assistant reads; who changed what. Anyone who
  // may write changes the repository's own; the kitchen's are changed in
  // the kitchen, through a lane.
  import { ago, ask } from './api.js';
  import { markdown } from './md.js';
  import Empty from './Empty.svelte';
  import Loading from './Loading.svelte';

  let { repo = null, who = null, role = null } = $props();

  const assistants = [
    ['claude', 'Claude Code'],
    ['codex', 'Codex'],
    ['zcode', 'ZCode'],
  ];
  const folders = ['all', ...assistants.map(([name]) => name)];

  let told = $state(null);
  let history = $state([]);
  let failed = $state('');
  let busy = $state(false);
  // The instruction open in the editor: its name, the text being written, and whether it is new.
  let open = $state(null);
  let text = $state('');
  let showing = $state('edit');
  // What one assistant is told, as its file reads.
  let previewFor = $state('claude');
  let preview = $state('');

  const mayWrite = $derived(role !== 'read');
  const kitchenRepo = $derived(told?.kitchen?.startsWith('../') ? told.kitchen.slice(3) : null);
  const mayOpenKitchen = $derived(kitchenRepo !== null && (who?.repos ?? []).some((one) => one.name === kitchenRepo));

  async function load() {
    try {
      const [now, changes] = await Promise.all([ask('instructions'), ask('instructions_history').catch(() => [])]);
      told = now;
      history = changes;
      failed = '';
    } catch (error) {
      failed = error.message;
    }
    loadPreview();
  }
  async function loadPreview() {
    try {
      preview = (await ask('instructions_text', { assistant: previewFor })).text;
    } catch (error) {
      preview = '';
    }
  }
  load();

  function edit(item) {
    open = { name: item.name, from: item.from, fresh: false };
    text = item.text;
    showing = 'edit';
  }
  let fresh = $state({ folder: 'all', file: '' });
  function startNew(event) {
    event.preventDefault();
    const file = fresh.file.trim().toLowerCase().replace(/\.md$/, '');
    if (!file) return;
    open = { name: `${fresh.folder}/${file}.md`, from: 'repository', fresh: true };
    text = `# ${file}\n\n`;
    showing = 'edit';
    fresh = { folder: 'all', file: '' };
  }

  async function act(work) {
    busy = true;
    failed = '';
    try {
      await work();
    } catch (error) {
      failed = error.message;
    }
    busy = false;
    await load();
  }
  const save = () =>
    act(async () => {
      await ask('instructions_set', { name: open.name, text });
      open = null;
    });
  const takeAway = (name) => act(() => ask('instructions_set', { name, text: '' }));
  const removeOwn = (name) =>
    confirm(`Remove this repository's ${name}?`) &&
    act(async () => {
      await ask('instructions_remove', { name });
      if (open?.name === name) open = null;
    });
  const restore = (change) =>
    confirm(`Put back ${change.name} as it was before ${change.by}'s change?`) &&
    act(() =>
      change.before === null || change.before === undefined
        ? ask('instructions_remove', { name: change.name })
        : ask('instructions_set', { name: change.name, text: change.before }),
    );

  const whereFrom = (item) =>
    item.from === 'kitchen' ? 'the kitchen' : item.overrides ? 'this repository, over the kitchen' : 'this repository';
  const kitchenLink = (name) => `?repo=${encodeURIComponent(kitchenRepo)}#/why/${encodeURIComponent(`instructions/${name}`)}`;
  const grouped = $derived(
    folders
      .map((folder) => [folder, (told?.items ?? []).filter((item) => item.name.startsWith(`${folder}/`))])
      .filter(([, items]) => items.length > 0),
  );
</script>

<div class="page-head">
  <div>
    <h1>What the assistants are told{repo ? ` in ${repo}` : ''}</h1>
    <p class="lead">
      Kito's rules come first, then the kitchen's instructions, then this repository's own, which win where both have a
      file of the same name. Kito writes them into <code>CLAUDE.md</code> and <code>AGENTS.md</code> at every session:
      they are not in the repository.
    </p>
  </div>
</div>

{#if failed}<p class="error" role="alert">{failed}</p>{/if}

{#if told === null && !failed}
  <Loading lines={4} />
{:else if told}
  <p class="faint kitchen">
    Kitchen:
    {#if !told.kitchen}the standard one (Kito's rules alone)
    {:else if mayOpenKitchen}<a href={`?repo=${encodeURIComponent(kitchenRepo)}#/why`}>{kitchenRepo}</a>
    {:else}{kitchenRepo ?? told.kitchen}{/if}
    {#if told.kitchen && !told.kitchen_found}<span class="chip bad">not found</span>{/if}
  </p>

  <div class="layout">
    <section class="list">
      {#each grouped as [folder, items]}
        <h2>{folder === 'all' ? 'Every assistant' : assistants.find(([name]) => name === folder)?.[1] ?? folder}</h2>
        {#each items as item (item.name)}
          <div class="item" class:current={open?.name === item.name}>
            <button class="bare name" onclick={() => edit(item)}>
              <span class="mono">{item.name.split('/')[1]}</span>
              <span class="chip {item.from === 'kitchen' ? '' : 'ok'}">{whereFrom(item)}</span>
            </button>
          </div>
        {/each}
      {:else}
        <p class="soft">Nothing beyond Kito's rules yet.</p>
      {/each}
      {#each told.removed ?? [] as name}
        <div class="item">
          <span class="mono faint">{name}</span>
          <span class="chip">the kitchen's, not told here</span>
          {#if mayWrite}<button class="quiet sm" disabled={busy} onclick={() => removeOwn(name)}>Tell it again</button>{/if}
        </div>
      {/each}

      {#if mayWrite}
        <form class="new" onsubmit={startNew}>
          <select bind:value={fresh.folder}>
            {#each folders as folder}<option value={folder}>{folder === 'all' ? 'every assistant' : folder}</option>{/each}
          </select>
          <input placeholder="name, as style" bind:value={fresh.file} />
          <button disabled={!fresh.file.trim()}>New</button>
        </form>
      {/if}
    </section>

    <section class="panel editor">
      {#if open}
        <div class="head">
          <span class="mono"><b>{open.name}</b></span>
          <span class="grow"></span>
          <div class="seg" role="group" aria-label="Text or preview">
            <button aria-pressed={showing === 'edit'} onclick={() => (showing = 'edit')}>Text</button>
            <button aria-pressed={showing === 'read'} onclick={() => (showing = 'read')}>Preview</button>
          </div>
        </div>
        {#if open.from === 'kitchen' && !open.fresh}
          <p class="faint">
            From the kitchen{#if mayOpenKitchen}: <a href={kitchenLink(open.name)}>open it there</a>, and change it
              through a lane{/if}. Saving here makes this repository's own, over the kitchen's.
          </p>
        {/if}
        {#if showing === 'edit' && mayWrite}
          <textarea class="mono" rows="18" bind:value={text}></textarea>
        {:else}
          <div class="rendered">{@html markdown(text)}</div>
        {/if}
        {#if mayWrite}
          <div class="actions">
            <button class="primary" disabled={busy || !text.trim()} onclick={save}>
              {open.from === 'kitchen' && !open.fresh ? 'Save as this repository’s' : 'Save'}
            </button>
            {#if open.from === 'kitchen' && !open.fresh}
              <button disabled={busy} onclick={() => takeAway(open.name)}>Don’t tell it here</button>
            {:else if !open.fresh}
              <button class="quiet" disabled={busy} onclick={() => removeOwn(open.name)}>Remove</button>
            {/if}
            <button class="quiet" onclick={() => (open = null)}>Close</button>
          </div>
        {/if}
      {:else}
        <div class="head">
          <span>What</span>
          <select bind:value={previewFor} onchange={loadPreview}>
            {#each assistants as [name, title]}<option value={name}>{title}</option>{/each}
          </select>
          <span>reads</span>
        </div>
        <div class="rendered">{@html markdown(preview.replace(/^<!--.*-->$/gm, ''))}</div>
      {/if}
    </section>
  </div>

  <h2 class="section-title">Changes</h2>
  {#if history.length === 0}
    <Empty title="No change yet.">Who writes, changes or removes an instruction here is kept, with a way to put it back.</Empty>
  {:else}
    <div class="panel changes">
      {#each history as change}
        <div class="change">
          <span><b>{change.by}</b> {change.after === null || change.after === undefined ? 'removed' : change.before ? 'changed' : 'wrote'} <span class="mono">{change.name}</span></span>
          <span class="faint">{ago(change.at_ms)}</span>
          <span class="grow"></span>
          {#if mayWrite}<button class="quiet sm" disabled={busy} onclick={() => restore(change)}>Put back as before</button>{/if}
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .kitchen {
    margin: 0 0 12px;
    font-size: 13px;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(220px, 280px) 1fr;
    gap: 16px;
    align-items: start;
    margin: 0 0 8px;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .list h2 {
    margin: 16px 0 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--soft);
  }
  .list h2:first-child {
    margin-top: 0;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin: 2px 0;
    font-size: 13px;
  }
  .item .name {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    color: inherit;
    cursor: pointer;
  }
  .item .name:hover {
    background: var(--hover);
  }
  .item.current .name {
    border-color: var(--line);
    background: var(--panel);
  }
  .new {
    display: flex;
    gap: 6px;
    margin-top: 12px;
  }
  .new input {
    flex: 1;
    min-width: 0;
  }
  .editor {
    padding: 16px;
    min-height: 300px;
    display: grid;
    gap: 10px;
    align-content: start;
  }
  .editor > p {
    margin: 0;
    font-size: 13px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .grow {
    flex: 1;
  }
  textarea {
    font-family: var(--mono);
    font-size: 12.5px;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .rendered {
    font-size: 14px;
    line-height: 1.6;
    max-height: 60vh;
    overflow: auto;
  }
  .rendered :global(pre) {
    background: var(--bg);
    border: 1px solid var(--line);
    padding: 8px 10px;
    border-radius: 6px;
    overflow: auto;
  }
  .changes {
    overflow: hidden;
  }
  .change {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 4px 16px;
    font-size: 13px;
    flex-wrap: wrap;
  }
  .change + .change {
    border-top: 1px solid var(--line);
  }
  .change b {
    font-weight: 600;
  }
</style>
