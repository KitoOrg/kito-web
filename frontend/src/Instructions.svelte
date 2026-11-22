<script>
  // What the assistants are told in a repository (Kito 0.32): the
  // kitchen's instructions and the repository's own, each with where it
  // comes from; what each assistant reads; who changed what. Anyone who
  // may write changes the repository's own; the kitchen's are changed in
  // the kitchen, through a lane.
  import { ask, focus } from './api.js';
  import { markdown } from './md.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import Editor from './Editor.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  let { who = null, role = null } = $props();

  const assistants = [
    ['claude', 'Claude Code'],
    ['codex', 'Codex'],
    ['zcode', 'ZCode'],
  ];
  const folders = ['all', ...assistants.map(([name]) => name)];
  // Whom the instructions of a folder are for, in words.
  const forWhom = (folder) => (folder === 'all' ? 'Every assistant' : (assistants.find(([name]) => name === folder)?.[1] ?? folder));

  let told = $state(null);
  let history = $state([]);
  let failed = $state('');
  // The instruction that is shown: its name, its text, where it comes from, and whether it is new.
  let open = $state(null);
  // What one assistant is told, as its file reads: null while it is asked for.
  let previewFor = $state('claude');
  let preview = $state(null);
  let previewFailed = $state('');
  // While a row of the page does something, and why it could not: in the list, among the changes.
  let busy = $state(false);
  let listFailed = $state('');
  let historyFailed = $state('');

  const mayWrite = $derived(role !== 'read');
  const kitchenRepo = $derived(told?.kitchen?.startsWith('../') ? told.kitchen.slice(3) : null);
  const mayOpenKitchen = $derived(kitchenRepo !== null && (who?.repos ?? []).some((one) => one.name === kitchenRepo));
  // The kitchen's own page, on a server that has one; else the lanes of its repository.
  const kitchenHref = $derived(
    !mayOpenKitchen
      ? null
      : who.plugins === undefined || who.plugins.includes('kitchen')
        ? `${location.pathname}#/kitchens?k=${encodeURIComponent(kitchenRepo)}`
        : `${location.pathname}?repo=${encodeURIComponent(kitchenRepo)}#/`,
  );

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
  // `anew`: for another assistant, so what is shown goes until its own is read.
  async function loadPreview(anew = false) {
    const assistant = previewFor;
    if (anew) preview = null;
    try {
      const { text } = await ask('instructions_text', { assistant });
      if (assistant !== previewFor) return;
      [preview, previewFailed] = [text, ''];
    } catch (error) {
      if (assistant !== previewFor) return;
      [preview, previewFailed] = ['', error.message];
    }
  }
  load();

  // Each folder that has something, with its instructions and those of the kitchen that are disabled here.
  const grouped = $derived.by(() => {
    const items = told?.items ?? [];
    const off = told?.removed ?? [];
    const named = [...items.map((item) => item.name), ...off].map((name) => name.split('/')[0]);
    return [...new Set([...folders, ...named])]
      .map((folder) => ({
        folder,
        items: items.filter((item) => item.name.startsWith(`${folder}/`)),
        off: off.filter((name) => name.startsWith(`${folder}/`)),
      }))
      .filter((group) => group.items.length + group.off.length > 0);
  });

  function show(item) {
    open = { name: item.name, text: item.text, from: item.from, overrides: Boolean(item.overrides), fresh: false };
  }
  let adding = $state(false);
  let fresh = $state({ folder: 'all', file: '' });
  function startNew(event) {
    event.preventDefault();
    const file = fresh.file.trim().toLowerCase().replace(/\.md$/, '');
    if (!file) return;
    open = { name: `${fresh.folder}/${file}.md`, text: `# ${file}\n\n`, from: 'repository', overrides: false, fresh: true };
    fresh = { folder: 'all', file: '' };
    adding = false;
  }

  // What the editor does with the instruction it shows: asked of the
  // repository, said when done, and the page read again without it open.
  async function apply(method, params, done) {
    const { name } = open;
    await ask(method, { name, ...params });
    toast(`${name} ${done}`);
    if (open?.name === name) open = null;
    await load();
  }
  const save = (text) => apply('instructions_set', { text }, 'saved');
  const remove = () => apply('instructions_remove', {}, 'removed');
  // An empty text of its own, over the kitchen's: the assistants are not told it here.
  const disable = () => apply('instructions_set', { text: '' }, 'disabled here');

  // What a row does: it says so when done, or why it could not under its list, and the page is read again.
  async function act(work, done, fail) {
    busy = true;
    fail('');
    try {
      await work();
      toast(done);
    } catch (error) {
      fail(error.message);
    }
    busy = false;
    await load();
  }
  const enable = (name) => act(() => ask('instructions_remove', { name }), `${name} enabled here`, (why) => (listFailed = why));

  // A change is of the repository's own text of an instruction: what it was before, what it is after
  // (null: none). An empty one is how the kitchen's is disabled here.
  const before = (change) => change.before !== null && change.before !== undefined;
  const did = (change) => {
    if (change.after === null || change.after === undefined) return change.before?.trim() === '' ? 'Enabled' : 'Removed';
    if (change.after.trim() === '') return 'Disabled';
    return change.before ? 'Changed' : 'Wrote';
  };
  const restore = (change) => {
    // What is shown may be the text that is put back over.
    if (open?.name === change.name) open = null;
    return act(
      () => (before(change) ? ask('instructions_set', { name: change.name, text: change.before }) : ask('instructions_remove', { name: change.name })),
      `${change.name} put back as before`,
      (why) => (historyFailed = why),
    );
  };
</script>

{#snippet overKitchen()}
  Saving makes it this repository’s own. The kitchen’s is changed
  {#if kitchenHref}<a href={kitchenHref}>in the kitchen</a>{:else}in the kitchen{/if}.
{/snippet}

<PageHead title="Instructions" docs="instructions" />

<Err message={failed} />

{#if told === null}
  {#if !failed}<Loading lines={4} />{/if}
{:else}
  <div class="stack">
    <p class="soft">
      {#if !told.kitchen}
        Uses the standard kitchen
      {:else}
        Uses the kitchen
        {#if kitchenHref}<a href={kitchenHref}>{kitchenRepo}</a>{:else if kitchenRepo}{kitchenRepo}{:else}<span class="mono">{told.kitchen}</span>{/if}
        {#if !told.kitchen_found}<span class="chip bad">not found</span>{/if}
      {/if}
    </p>

    <div class="cols left">
      <div class="stack">
        <nav class="panel groups" aria-label="Instructions">
          {#each grouped as group (group.folder)}
            <h4>{forWhom(group.folder)}</h4>
            <ul class="rows tight">
              {#each group.items as item (item.name)}
                <li>
                  <button class="row bare" aria-current={open?.name === item.name ? 'true' : undefined} onclick={() => show(item)}>
                    <span class="row-body">
                      <span class="row-title mono">{item.name.slice(group.folder.length + 1)}</span>
                      {#if item.overrides}<span class="row-meta">Over the kitchen’s</span>{/if}
                    </span>
                    <span class="tag">{item.from === 'kitchen' ? 'the kitchen' : 'this repository'}</span>
                  </button>
                </li>
              {/each}
              {#each group.off as name (name)}
                <li>
                  <div class="row">
                    <span class="row-body">
                      <span class="row-title mono faint">{name.slice(group.folder.length + 1)}</span>
                      <span class="row-meta">The kitchen’s, disabled here</span>
                    </span>
                    {#if mayWrite}<button class="quiet sm" disabled={busy} onclick={() => enable(name)}>Enable</button>{/if}
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <Empty inset title="Nothing beyond Kito’s rules yet" />
          {/each}
          {#if mayWrite}
            <div class="panel-foot">
              <form class="stack grow" onsubmit={startNew}>
                <div><button type="button" class="sm" aria-expanded={adding} onclick={() => (adding = !adding)}>New</button></div>
                {#if adding}
                  <label class="field">
                    <span>For</span>
                    <select class="sm" bind:value={fresh.folder}>
                      {#each folders as folder}<option value={folder}>{forWhom(folder)}</option>{/each}
                    </select>
                  </label>
                  <label class="field">
                    <span>Name</span>
                    <input class="sm" bind:value={fresh.file} placeholder="style" use:focus />
                  </label>
                  <div class="controls">
                    <button class="primary sm" disabled={!fresh.file.trim()}>Add</button>
                    <button type="button" class="quiet sm" onclick={() => (adding = false)}>Cancel</button>
                  </div>
                {/if}
              </form>
            </div>
          {/if}
        </nav>
        <Err message={listFailed} />
      </div>

      {#if open}
        {#key open}
          <Editor
            name={open.name}
            mono
            text={open.text}
            fresh={open.fresh}
            editable={mayWrite}
            onsave={save}
            oncancel={() => (open = null)}
            onremove={!mayWrite || open.fresh ? null : open.from === 'kitchen' ? disable : remove}
            removeLabel={open.from === 'kitchen' ? 'Disable' : 'Remove'}
            removeAsk={open.from === 'kitchen'
              ? `Disable ${open.name} in this repository? Its assistants are no longer told it; the kitchen keeps it.`
              : open.overrides
                ? `Remove ${open.name} from this repository? The kitchen’s instruction of that name is told again.`
                : `Remove ${open.name} from this repository? The assistants are no longer told it.`}
            hint={open.from === 'kitchen' && !open.fresh ? overKitchen : null}
          >
            {#snippet head()}
              {#if !open?.fresh}
                <button class="quiet sm icon" aria-label="Close" onclick={() => (open = null)}><Icon name="close" /></button>
              {/if}
            {/snippet}
          </Editor>
        {/key}
      {:else}
        <section class="panel">
          <div class="panel-head">
            <h3>What an assistant reads</h3>
            <span class="grow"></span>
            <select class="sm" aria-label="Assistant" bind:value={previewFor} onchange={() => loadPreview(true)}>
              {#each assistants as [name, title]}<option value={name}>{title}</option>{/each}
            </select>
          </div>
          {#if preview === null}
            <Loading inset lines={6} />
          {:else if previewFailed}
            <div class="pad"><Err message={previewFailed} /></div>
          {:else}
            <div class="rendered pad reads">{@html markdown(preview.replace(/^<!--.*-->$/gm, ''))}</div>
          {/if}
        </section>
      {/if}
    </div>
  </div>

  <h2 class="section-title">Changes</h2>
  <div class="stack">
    <div class="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>Who</th><th>What</th><th>When</th>
            {#if mayWrite}<th class="actions"><span class="sr">Put back</span></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each history as change}
            <tr>
              <td>{change.by}</td>
              <td>{did(change)} <span class="mono">{change.name}</span></td>
              <td class="soft"><Time ms={change.at_ms} /></td>
              {#if mayWrite}
                <td class="actions">
                  <Confirm
                    label="Put back as before"
                    ask={before(change)
                      ? `Put back ${change.name} as it was before ${change.by}’s change? The text this repository has of it now is replaced.`
                      : `Put back ${change.name} as it was before ${change.by}’s change? This repository had no text of its own then: the one it has now is removed.`}
                    yes="Put back"
                    working="Putting back…"
                    onyes={() => restore(change)}
                    disabled={busy}
                    sm
                  />
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={mayWrite ? 4 : 3}>
                <Empty inset title="No change yet" />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Err message={historyFailed} />
  </div>
{/if}

<style>
  /* What an assistant reads is long: it scrolls in its own box. */
  .reads {
    max-height: 60vh;
    overflow: auto;
  }
</style>
