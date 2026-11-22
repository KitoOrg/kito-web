<script>
  // Behind a server with the kitchen plugin (kito-kitchen, ADR 0007): the
  // kitchens of the server, which repositories use each, and one kitchen
  // read part by part. Who may write in a kitchen changes its files here,
  // through a lane as any code; who maintains a repository attaches it to
  // a kitchen. A new one is started on the server's machine: an empty
  // repository has no main lane a lane could start from.
  import { ago, askIn } from './api.js';
  import { aboutOf, changeIn, kindOf, manifest, partOf, readIn } from './kitchen.js';
  import { markdown } from './md.js';
  import { toast } from './toast.svelte.js';
  import Empty from './Empty.svelte';
  import Loading from './Loading.svelte';

  let { who, k = null } = $props();

  const home = location.pathname;
  const admin = $derived(Boolean(who?.admin));
  const roleIn = (name) => who?.repos.find((one) => one.name === name)?.role ?? null;
  const mayMaintain = (name) => admin || roleIn(name) === 'maintain';
  const mayWriteIn = (name) => admin || ['write', 'integrate', 'maintain'].includes(roleIn(name));
  const mayIntegrateIn = (name) => admin || ['integrate', 'maintain'].includes(roleIn(name));
  // `../kitchen` in a repository's configuration: the repository `kitchen`.
  const named = (kitchen) => (kitchen?.startsWith('../') ? kitchen.slice(3) : null);

  // Every repository this person may read: whether it is a kitchen, and the kitchen it names.
  let seen = $state(null);
  let failed = $state('');

  async function survey() {
    try {
      const repos = who?.repos ?? [];
      seen = await Promise.all(
        repos.map(async (one) => {
          const [toml, told] = await Promise.all([
            readIn(one.name, 'kitchen.toml').catch(() => null),
            askIn(one.name, 'instructions').catch(() => null),
          ]);
          return {
            name: one.name,
            role: one.role,
            toml: toml ? manifest(toml.text) : null,
            uses: named(told?.kitchen),
            usesFound: told?.kitchen_found ?? true,
          };
        }),
      );
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  survey();

  // A kitchen: a repository with a kitchen.toml, or one another repository names.
  const kitchens = $derived.by(() => {
    if (seen === null) return null;
    const names = new Set(seen.filter((one) => one.toml).map((one) => one.name));
    for (const one of seen) if (one.uses) names.add(one.uses);
    return [...names].sort().map((name) => {
      const own = seen.find((one) => one.name === name);
      return {
        name,
        title: own?.toml?.name ?? name,
        about: own?.toml?.about ?? '',
        marked: Boolean(own?.toml),
        readable: Boolean(own),
        users: seen.filter((one) => one.uses === name).map((one) => one.name),
      };
    });
  });
  const kitchen = $derived(k ? (kitchens?.find((one) => one.name === k) ?? null) : null);

  // ---- One kitchen: its files, one of them open.
  let files = $state(null);
  let filesFailed = $state('');
  let open = $state(null); // { path, text, blob, fresh }
  let reading = $state(false);
  let history = $state(null);

  async function loadFiles() {
    if (!k) return;
    try {
      const listed = await askIn(k, 'lane_files', {});
      files = (listed.files ?? []).map((one) => one.path).sort();
      filesFailed = '';
      if (open === null) {
        const first = files.find((path) => path === 'behaviour.md') ?? files.find((path) => kindOf(path) !== 'other') ?? files[0];
        if (first) await show(first);
      }
    } catch (error) {
      filesFailed = error.message;
    }
  }
  $effect(() => {
    if (k) loadFiles();
  });

  const groups = $derived.by(() => {
    const all = files ?? [];
    const order = [
      ['behaviour', 'Behaviour'],
      ['concept', 'Concepts'],
      ['recipe', 'Recipes'],
      ['tool', 'Tools'],
      ['instruction', 'Instructions'],
    ];
    const parts = [...new Set(all.map(partOf).filter(Boolean))].sort();
    const out = order.map(([kind, title]) => [title, all.filter((path) => partOf(path) === '' && kindOf(path) === kind)]);
    for (const part of parts) out.push([`Part: ${part}`, all.filter((path) => partOf(path) === part)]);
    out.push(['Other files', all.filter((path) => partOf(path) === '' && kindOf(path) === 'other')]);
    return out.filter(([, paths]) => paths.length > 0);
  });

  const label = (path) => {
    const rest = partOf(path) ? path.split('/').slice(2).join('/') : path;
    return rest.replace(/^(concepts|recipes|tools|instructions)\//, '');
  };

  async function show(path) {
    editing = false;
    reading = true;
    history = null;
    try {
      const found = await readIn(k, path);
      open = { path, text: found?.text ?? '', blob: found?.blob ?? null, fresh: false };
      text = open.text;
      loadHistory(path);
    } catch (error) {
      filesFailed = error.message;
    }
    reading = false;
  }

  async function loadHistory(path) {
    try {
      const items = await askIn(k, 'log', { path, limit: 20 });
      history = items.filter((item) => item.type !== 'checkpoint' && !item.symbol && (item.path === path || !item.path));
    } catch {
      history = [];
    }
  }

  // ---- Writing a file of the kitchen: through a lane, as code is.
  let editing = $state(false);
  let showing = $state('edit');
  let text = $state('');
  let why = $state('');
  let saving = $state('');
  let saved = $state(null);

  function startEdit() {
    editing = true;
    showing = 'edit';
    text = open.text;
    why = '';
    saved = null;
  }

  let fresh = $state({ kind: 'concepts', name: '' });
  function startNew(event) {
    event.preventDefault();
    const name = fresh.name.trim().toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9._-]+/g, '-');
    if (!name) return;
    const path = `${fresh.kind}/${name}.md`;
    open = { path, text: '', blob: null, fresh: true };
    text = fresh.kind === 'concepts' ? `# What "${name}" means here\n\n` : `# How to ${name.replaceAll('-', ' ')}\n\n1. \n`;
    history = [];
    editing = true;
    showing = 'edit';
    why = '';
    saved = null;
    fresh = { kind: fresh.kind, name: '' };
  }

  async function save() {
    saving = 'opening a lane';
    filesFailed = '';
    saved = null;
    const path = open.path;
    try {
      const done = await changeIn(k, {
        agent: who.user,
        intent: why.trim() || `${open.fresh ? 'Write' : 'Change'} ${path} of the kitchen`,
        files: [[path, text, open.blob]],
        integrate: mayIntegrateIn(k),
        waiting: (now) => (saving = now),
      });
      saved = done;
      if (done.result?.result === 'integrated') {
        toast(`${path} is in the kitchen`);
        editing = false;
        open = null;
        files = null;
        await loadFiles();
        await show(path);
      } else if (done.result === null) {
        toast(`${path} waits in ${done.lane}`);
      }
    } catch (error) {
      filesFailed = error.message;
    }
    saving = '';
  }

  // ---- Which repositories use this kitchen.
  let attach = $state({});
  let attaching = $state(false);
  $effect(() => {
    if (!seen || !k) return;
    attach = Object.fromEntries(seen.filter((one) => one.name !== k).map((one) => [one.name, one.uses === k]));
  });
  const attachChanged = $derived((seen ?? []).filter((one) => one.name !== k && attach[one.name] !== undefined && attach[one.name] !== (one.uses === k)));

  async function applyAttach() {
    attaching = true;
    filesFailed = '';
    try {
      for (const one of attachChanged) {
        await askIn(one.name, 'configure', { kitchen: attach[one.name] ? `../${k}` : null });
      }
      const [one] = attachChanged;
      toast(
        attachChanged.length > 1
          ? `${attachChanged.length} repositories changed`
          : attach[one.name]
            ? `${one.name} uses ${kitchen?.title ?? k} now`
            : `${one.name} has the standard kitchen now`,
      );
      await survey();
    } catch (error) {
      filesFailed = error.message;
      await survey();
    }
    attaching = false;
  }

  const isMarkdown = (path) => path.endsWith('.md');
</script>

{#if !k}
  <div class="page-head">
    <div>
      <h1>Kitchens</h1>
      <p class="lead">
        What a team shares to work on its repositories: how its agents behave, what its words mean, how things are done
        here. A kitchen is a repository of this server with a <code>kitchen.toml</code>; the repositories attached to it
        give its instructions to every assistant.
      </p>
    </div>
  </div>

  {#if failed}<p class="error" role="alert">{failed}</p>{/if}

  {#if admin}
    <details class="panel start">
      <summary>How a kitchen is started</summary>
      <p class="soft">
        A kitchen starts as files on a machine, then becomes a repository of this server. On the server's machine:
      </p>
      <pre>kito-server kitchen new ./kitchen "Our team"
kito-server repo add kitchen --from &lt;a git repository of it&gt;</pre>
      <p class="soft">
        Or from a connected directory holding those files: <code>kito repos add kitchen --push ./kitchen</code>. It shows
        here as soon as its main lane has a <code>kitchen.toml</code>.
      </p>
    </details>
  {/if}

  {#if kitchens === null && !failed}
    <Loading lines={3} />
  {:else if kitchens?.length === 0}
    <Empty title="No kitchen yet">
      None of the repositories you may read has a <code>kitchen.toml</code>, and none is attached to a kitchen.
      An admin of this server starts one.
    </Empty>
  {:else if kitchens}
    <ul class="panel list">
      {#each kitchens as one (one.name)}
        <li>
          <a class="row" href={`${home}#/kitchens?k=${encodeURIComponent(one.name)}`}>
            <span class="body">
              <span class="title">{one.title}</span>
              <span class="meta">
                <span class="mono">{one.name}</span>
                {#if one.about}· {one.about}{/if}
              </span>
            </span>
            <span class="side">
              {#if !one.readable}
                <span class="chip warn" title="You may not read this repository">not yours to read</span>
              {:else if !one.marked}
                <span class="chip" title="It has no kitchen.toml: only its instructions are given">instructions only</span>
              {/if}
              <span class="chip {one.users.length > 0 ? 'accent' : ''}">
                {one.users.length === 0 ? 'used by none' : `used by ${one.users.length}`}
              </span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
    <p class="faint note">Only the repositories you may read are looked at.</p>
  {/if}
{:else}
  <p class="back"><a href={`${home}#/kitchens`}>← Kitchens</a></p>
  {#if seen === null}
    <Loading lines={3} />
  {:else if !kitchen || !kitchen.readable}
    <Empty title={`No kitchen ${k} for you`}>It is not a repository of this server you may read.</Empty>
  {:else}
    <div class="page-head">
      <div>
        <h1>{kitchen.title}</h1>
        <p class="lead">
          <span class="mono">{k}</span>
          {#if kitchen.about}· {kitchen.about}{/if}
          · you may {roleIn(k) ?? (admin ? 'maintain' : 'read')} it
        </p>
      </div>
      <div class="actions">
        <a class="button" href={`${home}?repo=${encodeURIComponent(k)}#/`}>Its lanes</a>
      </div>
    </div>

    {#if !kitchen.marked}
      <p class="notice">
        This repository has no <code>kitchen.toml</code>: the repositories attached to it are given its
        <code>instructions/</code>, and the kitchen plugin finds no behaviour, concepts or recipes in it.
      </p>
    {/if}
    {#if filesFailed}<p class="error" role="alert">{filesFailed}</p>{/if}

    <div class="layout">
      <nav class="panel parts" aria-label="Parts of the kitchen">
        {#if files === null}
          <Loading lines={4} inset />
        {:else}
          {#each groups as [title, paths]}
            <h2>{title}</h2>
            {#each paths as path}
              <button class="bare file" aria-current={open?.path === path ? 'true' : undefined} onclick={() => show(path)}>
                <span class="mono">{label(path)}</span>
              </button>
            {/each}
          {:else}
            <p class="soft pad">Nothing in it yet.</p>
          {/each}
          {#if mayWriteIn(k)}
            <form class="new" onsubmit={startNew}>
              <select class="sm" bind:value={fresh.kind} aria-label="What to write">
                <option value="concepts">concept</option>
                <option value="recipes">recipe</option>
              </select>
              <input class="sm" placeholder="name" aria-label="Its name" bind:value={fresh.name} />
              <button class="sm" disabled={!fresh.name.trim()}>New</button>
            </form>
          {/if}
        {/if}
      </nav>

      <section class="panel viewer">
        {#if open}
          <header>
            <b class="mono">{open.path}</b>
            {#if !open.fresh && kindOf(open.path) !== 'other' && isMarkdown(open.path) && ['concept', 'recipe'].includes(kindOf(open.path))}
              <span class="faint first">{aboutOf(open.text)}</span>
            {/if}
            <span class="grow"></span>
            {#if editing && isMarkdown(open.path)}
              <div class="seg" role="group" aria-label="Text or preview">
                <button aria-pressed={showing === 'edit'} onclick={() => (showing = 'edit')}>Text</button>
                <button aria-pressed={showing === 'read'} onclick={() => (showing = 'read')}>Preview</button>
              </div>
            {:else if !editing && mayWriteIn(k)}
              <button class="sm" onclick={startEdit}>Edit</button>
            {/if}
          </header>
          {#if reading}
            <Loading lines={5} inset />
          {:else if editing}
            <div class="edit">
              {#if showing === 'edit' || !isMarkdown(open.path)}
                <textarea class="mono" rows="18" bind:value={text} aria-label={`The text of ${open.path}`} spellcheck="false"></textarea>
              {:else}
                <div class="rendered">{@html markdown(text)}</div>
              {/if}
              <label class="field">
                <span>Why <span class="hint">(what the lane is for, and what the log will say)</span></span>
                <input bind:value={why} placeholder={`${open.fresh ? 'Write' : 'Change'} ${open.path} of the kitchen`} />
              </label>
              <div class="controls">
                <button class="primary" disabled={saving !== '' || (!open.fresh && text === open.text) || !text.trim()} onclick={save}>
                  {#if saving}{saving[0].toUpperCase()}{saving.slice(1)}…{:else if mayIntegrateIn(k)}Save and integrate{:else}Save in a lane{/if}
                </button>
                <button class="quiet" disabled={saving !== ''} onclick={() => (open.fresh ? (open = null) : (editing = false))}>Cancel</button>
                <span class="faint small">
                  {mayIntegrateIn(k)
                    ? 'A lane is opened for it, then integrated: the kitchen is what its main lane has.'
                    : 'A lane is opened for it; somebody who may integrate brings it in.'}
                </span>
              </div>
              {#if saved && saved.result?.result !== 'integrated'}
                <p class="notice">
                  {#if saved.result === null}
                    It waits in <a href={`${home}?repo=${encodeURIComponent(k)}#/lane/${encodeURIComponent(saved.lane)}`}>{saved.lane}</a> for somebody who may integrate.
                  {:else}
                    Not integrated ({saved.result.missing ?? saved.result.result.replaceAll('_', ' ')}): it is in
                    <a href={`${home}?repo=${encodeURIComponent(k)}#/lane/${encodeURIComponent(saved.lane)}`}>{saved.lane}</a>.
                  {/if}
                </p>
              {/if}
            </div>
          {:else if isMarkdown(open.path)}
            <div class="rendered pad">{@html markdown(open.text)}</div>
          {:else}
            <pre class="code">{open.text}</pre>
          {/if}
        {:else if files !== null}
          <Empty inset title="Pick a part of the kitchen">Its behaviour, a concept, a recipe, a tool or an instruction.</Empty>
        {/if}
      </section>
    </div>

    {#if open && !open.fresh}
      <h2 class="section-title">Changes to {open.path}</h2>
      {#if history === null}
        <Loading lines={2} />
      {:else if history.length === 0}
        <Empty title="No change recorded yet." />
      {:else}
        <div class="panel changes">
          {#each history as item (item.id)}
            <div class="change">
              <b>{item.author}</b>
              <span class="soft">{item.intent ? `“${item.intent}”` : (item.detail ?? item.op.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}</span>
              {#if item.lane && !['main', 'lane/main'].includes(item.lane)}<a class="mono small" href={`${home}?repo=${encodeURIComponent(k)}#/lane/${encodeURIComponent(item.lane)}`}>{item.lane}</a>{/if}
              <span class="grow"></span>
              <span class="faint small">{ago(item.at_ms)}</span>
            </div>
          {/each}
        </div>
        <p class="faint note">
          An earlier text is not shown here yet: to put one back, edit the file again, or work in a lane of
          <span class="mono">{k}</span> from a connected directory.
        </p>
      {/if}
    {/if}

    <h2 class="section-title">Repositories that use it</h2>
    <p class="soft about">
      An attached repository gives the kitchen's instructions to every assistant, before its own. Its maintainers attach
      it; this sets <code>kitchen</code> in its configuration.
    </p>
    {#if (seen ?? []).filter((one) => one.name !== k).length === 0}
      <Empty title="No other repository">There is no repository you may read to attach.</Empty>
    {:else}
      <div class="panel table-wrap">
        <table>
          <thead><tr><th></th><th>Repository</th><th>Its kitchen now</th><th>You may</th></tr></thead>
          <tbody>
            {#each seen.filter((one) => one.name !== k) as one (one.name)}
              <tr>
                <td class="tick">
                  <input
                    type="checkbox"
                    aria-label={`${one.name} uses ${k}`}
                    disabled={!mayMaintain(one.name) || attaching}
                    bind:checked={attach[one.name]}
                  />
                </td>
                <td><a class="mono" href={`${home}?repo=${encodeURIComponent(one.name)}#/settings`}>{one.name}</a></td>
                <td>
                  {#if one.uses === k}<span class="chip accent">this one</span>
                  {:else if one.uses}<span class="mono">{one.uses}</span>{#if !one.usesFound}&nbsp;<span class="chip bad">not found</span>{/if}
                  {:else}<span class="faint">the standard one</span>{/if}
                </td>
                <td class="soft">{mayMaintain(one.name) ? 'change it' : `${one.role}: a maintainer changes it`}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="controls apply">
        <button class="primary" disabled={attaching || attachChanged.length === 0} onclick={applyAttach}>
          {attaching ? 'Saving…' : attachChanged.length > 0 ? `Save ${attachChanged.length} ${attachChanged.length === 1 ? 'change' : 'changes'}` : 'Save'}
        </button>
        {#if attachChanged.some((one) => one.uses && one.uses !== k && attach[one.name])}
          <span class="faint small">A repository that had another kitchen leaves it for this one.</span>
        {/if}
      </div>
    {/if}
  {/if}
{/if}

<style>
  .start {
    margin: 0 0 16px;
    padding: 0 16px;
    font-size: 13px;
  }
  .start summary {
    padding: 10px 0;
    font-weight: 500;
    cursor: pointer;
  }
  .start p {
    margin: 0 0 8px;
  }
  .start pre {
    margin: 0 0 8px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    font: 12.5px/1.6 var(--mono);
    overflow-x: auto;
  }
  .start[open] {
    padding-bottom: 8px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .list li + li {
    border-top: 1px solid var(--line);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    color: inherit;
  }
  .row:hover {
    text-decoration: none;
    background: var(--hover);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .title {
    font-weight: 500;
  }
  .meta {
    font-size: 12.5px;
    color: var(--soft);
    overflow-wrap: anywhere;
  }
  .side {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .note {
    margin: 8px 0 0;
    font-size: 12.5px;
  }
  .back {
    margin: 0 0 12px;
    font-size: 13px;
  }
  .page-head .lead .mono {
    font-size: 12.5px;
  }
  .page-head .button {
    min-height: var(--control-sm);
  }
  .notice {
    margin: 0 0 16px;
  }
  .layout {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .parts {
    padding: 8px;
  }
  .parts h2 {
    margin: 12px 8px 4px;
    font-size: 12px;
    font-weight: 500;
    color: var(--soft);
  }
  .parts h2:first-child {
    margin-top: 4px;
  }
  .file {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 30px;
    padding: 0 8px;
    border-radius: var(--radius);
    color: var(--ink);
    font-size: 13px;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .file:hover {
    background: var(--hover);
  }
  .file[aria-current='true'] {
    background: var(--accent-wash);
    color: var(--accent);
    font-weight: 500;
  }
  .pad {
    margin: 0;
    padding: 8px;
    font-size: 13px;
  }
  .new {
    display: flex;
    gap: 6px;
    margin: 12px 0 4px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .new select {
    flex: none;
  }
  .new input {
    flex: 1;
    min-width: 0;
  }
  .viewer {
    min-width: 0;
    overflow: hidden;
  }
  .viewer header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-height: 44px;
    padding: 6px 16px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .first {
    font-size: 12.5px;
  }
  .grow {
    flex: 1;
  }
  .rendered {
    padding: 16px 20px;
    font-size: 14px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .rendered :global(h1),
  .rendered :global(h2),
  .rendered :global(h3) {
    margin: 0 0 8px;
  }
  .rendered :global(h1) {
    font-size: 18px;
  }
  .rendered :global(p) {
    margin: 0 0 10px;
  }
  .rendered :global(pre) {
    background: var(--bg);
    border: 1px solid var(--line);
    padding: 8px 10px;
    border-radius: 6px;
    overflow: auto;
  }
  .code {
    margin: 0;
    padding: 16px 20px;
    font: 12.5px/1.6 var(--mono);
    overflow-x: auto;
  }
  .edit {
    display: grid;
    gap: 12px;
    padding: 16px;
  }
  .edit .rendered {
    padding: 0;
    max-height: 60vh;
    overflow: auto;
  }
  .edit textarea {
    font-family: var(--mono);
    font-size: 12.5px;
  }
  .small {
    font-size: 12.5px;
  }
  .changes {
    overflow: hidden;
  }
  .change {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-height: 40px;
    padding: 6px 16px;
    font-size: 13px;
  }
  .change + .change {
    border-top: 1px solid var(--line);
  }
  .change b {
    font-weight: 600;
  }
  .about {
    margin: -4px 0 10px;
    font-size: 13px;
  }
  .tick {
    width: 36px;
  }
  .apply {
    margin-top: 12px;
  }
</style>
