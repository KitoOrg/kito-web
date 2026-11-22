<script>
  // Behind a server with the kitchen plugin (kito-kitchen, ADR 0007): the
  // kitchens of the server, which repositories use each, and one kitchen
  // read part by part. Who may write in a kitchen changes its files here,
  // through a lane as any code; who maintains a repository says which
  // kitchen it uses. A new one is started on the server's machine: an empty
  // repository has no main lane a lane could start from.
  import { askIn, focus, laneLink } from './api.js';
  import { count, humanize, laneName, opName } from './format.js';
  import { changeIn, kindOf, manifest, partOf, readIn } from './kitchen.js';
  import { outcome } from './standing.js';
  import { toast } from './toast.svelte.js';
  import Editor from './Editor.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  let { who, k = null } = $props();

  const home = location.pathname;
  const admin = $derived(Boolean(who?.admin));
  const roleIn = (name) => who?.repos.find((one) => one.name === name)?.role ?? null;
  const mayMaintain = (name) => admin || roleIn(name) === 'maintain';
  const mayWriteIn = (name) => admin || ['write', 'integrate', 'maintain'].includes(roleIn(name));
  const mayIntegrateIn = (name) => admin || ['integrate', 'maintain'].includes(roleIn(name));
  // `../kitchen` in a repository's configuration: the repository `kitchen`.
  const named = (kitchen) => (kitchen?.startsWith('../') ? kitchen.slice(3) : null);

  // Where things are: this page, the page of one kitchen, the lanes of a repository, one of them.
  const toList = { href: `${home}#/kitchens`, label: 'Kitchens' };
  const pageOf = (name) => `${home}#/kitchens?k=${encodeURIComponent(name)}`;
  const lanesOf = (name) => `${home}?repo=${encodeURIComponent(name)}#/`;
  const laneIn = (name, lane) => `${home}?repo=${encodeURIComponent(name)}${laneLink(String(lane))}`;

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
  // What this person may do in it: everything for an admin, else by their role in its repository.
  const MAY = { read: 'read it', write: 'write in it', integrate: 'integrate its lanes', maintain: 'maintain it' };
  const may = $derived(MAY[admin ? 'maintain' : roleIn(k)] ?? 'read it');

  // ---- One kitchen: its files, and the one that is read.
  let files = $state(null);
  let filesFailed = $state('');
  // The file that is shown: { path, text, blob, fresh }; and the one asked for, until it is read.
  let open = $state(null);
  let wanted = $state(null);
  let readFailed = $state('');
  let history = $state(null);
  let historyFailed = $state('');

  async function loadFiles() {
    if (!k) return;
    try {
      const listed = await askIn(k, 'lane_files', {});
      files = (listed.files ?? []).map((one) => one.path).sort();
      filesFailed = '';
      if (open === null && wanted === null) {
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
    wanted = path;
    readFailed = '';
    history = null;
    historyFailed = '';
    why = '';
    try {
      const found = await readIn(k, path);
      // Another one was asked for meanwhile.
      if (wanted !== path) return;
      open = { path, text: found?.text ?? '', blob: found?.blob ?? null, fresh: false };
      loadHistory(path);
    } catch (error) {
      if (wanted !== path) return;
      open = null;
      readFailed = error.message;
    }
    wanted = null;
  }

  async function loadHistory(path) {
    try {
      const items = await askIn(k, 'log', { path, limit: 20 });
      if (open?.path !== path) return;
      history = items.filter((item) => item.type !== 'checkpoint' && !item.symbol && (item.path === path || !item.path));
    } catch (error) {
      if (open?.path !== path) return;
      history = [];
      historyFailed = error.message;
    }
  }
  // What a change did, when nobody said why: `PutFile` as `put file`.
  const done = (item) => item.detail ?? opName(item.op);

  // ---- Writing a file of the kitchen: through a lane, as code is.
  // What the lane is for, as whoever writes says it.
  let why = $state('');
  // Where a save stands while it is made, and what came of one that was not integrated.
  let progress = $state('');
  let waits = $state(null);

  let adding = $state(false);
  let fresh = $state({ kind: 'concepts', name: '' });
  function startNew(event) {
    event.preventDefault();
    const name = fresh.name.trim().toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9._-]+/g, '-');
    if (!name) return;
    const text = fresh.kind === 'concepts' ? `# What "${name}" means here\n\n` : `# How to ${name.replaceAll('-', ' ')}\n\n1. \n`;
    wanted = null;
    readFailed = '';
    open = { path: `${fresh.kind}/${name}.md`, text, blob: null, fresh: true };
    history = [];
    why = '';
    fresh = { kind: fresh.kind, name: '' };
    adding = false;
  }

  async function save(text) {
    const { path, blob, fresh: isNew } = open;
    progress = 'Opening a lane…';
    waits = null;
    try {
      const made = await changeIn(k, {
        agent: who.user,
        intent: why.trim() || `${isNew ? 'Write' : 'Change'} ${path} of the kitchen`,
        files: [[path, text, blob]],
        integrate: mayIntegrateIn(k),
        waiting: (now) => (progress = now),
      });
      if (made.result?.result === 'integrated') {
        toast(`${path} saved`);
        await loadFiles();
        await show(path);
      } else {
        // It is in its lane, not in the kitchen: what is read here has not changed.
        waits = { path, lane: made.lane, result: made.result };
        if (isNew && open?.fresh && open.path === path) open = null;
      }
    } finally {
      progress = '';
    }
  }
  // What saving does, said under "Save"; while it is made, where it stands.
  const saveHint = $derived(
    progress ||
      (mayIntegrateIn(k)
        ? 'A lane is opened for it, then integrated: the kitchen is what its main lane has.'
        : 'A lane is opened for it; somebody who may integrate integrates it.'),
  );

  // ---- Which repositories use this kitchen: those that are checked.
  let chosen = $state({});
  let choosing = $state(false);
  let choiceFailed = $state('');
  $effect(() => {
    if (!seen || !k) return;
    chosen = Object.fromEntries(seen.filter((one) => one.name !== k).map((one) => [one.name, one.uses === k]));
  });
  const others = $derived((seen ?? []).filter((one) => one.name !== k));
  const changes = $derived(others.filter((one) => chosen[one.name] !== undefined && chosen[one.name] !== (one.uses === k)));

  async function saveChoice() {
    choosing = true;
    choiceFailed = '';
    try {
      for (const one of changes) {
        await askIn(one.name, 'configure', { kitchen: chosen[one.name] ? `../${k}` : null });
      }
      const [one] = changes;
      toast(
        changes.length > 1
          ? `${count(changes.length, 'repository', 'repositories')} changed`
          : chosen[one.name]
            ? `${one.name} uses the kitchen ${kitchen?.title ?? k}`
            : `${one.name} uses the standard kitchen`,
      );
    } catch (error) {
      choiceFailed = error.message;
    }
    await survey();
    choosing = false;
  }
</script>

{#if !k}
  <PageHead title="Kitchens">
    {#snippet lead()}
      What a team shares to work on its repositories: how its agents behave, what its words mean, how things are done
      here. A kitchen is a repository of this server with a <code>kitchen.toml</code>; the repositories that use it give
      its instructions to every assistant.
    {/snippet}
  </PageHead>

  <Err message={failed} />

  <div class="stack">
    {#if admin}
      <details class="panel pad start">
        <summary>How a kitchen is started</summary>
        <div class="box">
          <p class="soft">
            A kitchen starts as files on a machine, then becomes a repository of this server. On the server’s machine:
          </p>
          <pre>kito-server kitchen new ./kitchen "Our team"
kito-server repo add kitchen --from &lt;a git repository of it&gt;</pre>
          <p class="soft">
            Or from a connected directory holding those files: <code>kito repos add kitchen --push ./kitchen</code>. It
            shows here as soon as its main lane has a <code>kitchen.toml</code>.
          </p>
        </div>
      </details>
    {/if}

    {#if kitchens === null}
      {#if !failed}<Loading lines={3} />{/if}
    {:else if kitchens.length === 0}
      <Empty title="No kitchen yet">
        None of the repositories you may read has a <code>kitchen.toml</code>, and none uses a kitchen. An admin of this
        server starts one.
      </Empty>
    {:else}
      <div>
        <div class="cards">
          {#each kitchens as one (one.name)}
            {#if one.readable}
              <a class="panel pad" href={pageOf(one.name)}>{@render card(one)}</a>
            {:else}
              <div class="panel pad">{@render card(one)}</div>
            {/if}
          {/each}
        </div>
        <p class="footnote">Only the repositories you may read are looked at.</p>
      </div>
    {/if}
  </div>
{:else if seen === null}
  <PageHead title={k} back={toList} />
  {#if failed}<Err message={failed} />{:else}<Loading lines={3} />{/if}
{:else if !kitchen || !kitchen.readable}
  <PageHead title={k} back={toList} />
  <Empty title="No such kitchen for you">It is not a repository of this server you may read.</Empty>
{:else}
  <PageHead title={kitchen.title} back={toList}>
    {#snippet lead()}
      {kitchen.about || 'A kitchen of this server'}{#if kitchen.title !== k}&nbsp;· the repository {k}{/if} · you may {may}
    {/snippet}
    {#snippet actions()}
      <a class="button sm" href={lanesOf(k)}>Its lanes</a>
    {/snippet}
  </PageHead>

  <Err message={failed} />
  {#if !kitchen.marked}
    <p class="notice">
      This repository has no <code>kitchen.toml</code>: the repositories that use it are given its
      <code>instructions/</code>, and the kitchen plugin finds no behaviour, concepts or recipes in it.
    </p>
  {/if}
  <Err message={filesFailed} />

  {#if files !== null || !filesFailed}
    <div class="cols left">
      <nav class="panel groups" aria-label="Parts of the kitchen">
        {#if files === null}
          <Loading lines={4} inset />
        {:else}
          {#each groups as [title, paths]}
            <h4>{title}</h4>
            <ul class="rows tight">
              {#each paths as path}
                <li>
                  <button class="row bare" aria-current={(wanted ?? open?.path) === path ? 'true' : undefined} onclick={() => show(path)}>
                    <span class="row-title mono">{label(path)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <Empty inset title="Nothing in it yet" />
          {/each}
          {#if mayWriteIn(k)}
            <div class="panel-foot">
              <form class="stack grow" onsubmit={startNew}>
                <div><button type="button" class="sm" aria-expanded={adding} onclick={() => (adding = !adding)}>New</button></div>
                {#if adding}
                  <label class="field">
                    <span>Kind</span>
                    <select class="sm" bind:value={fresh.kind}>
                      <option value="concepts">concept</option>
                      <option value="recipes">recipe</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>Name</span>
                    <input class="sm" bind:value={fresh.name} placeholder="rounding" use:focus />
                  </label>
                  <div class="controls">
                    <button class="primary sm" disabled={!fresh.name.trim()}>Add</button>
                    <button type="button" class="quiet sm" onclick={() => (adding = false)}>Cancel</button>
                  </div>
                {/if}
              </form>
            </div>
          {/if}
        {/if}
      </nav>

      <div class="stack">
        {#if files === null || wanted !== null}
          <div class="panel"><Loading lines={5} inset /></div>
        {:else if readFailed}
          <Err message={readFailed} />
        {:else if open}
          {#key open}
            <Editor
              name={open.path}
              mono
              text={open.text}
              fresh={open.fresh}
              editable={mayWriteIn(k)}
              onsave={save}
              oncancel={() => (open = null)}
              hint={saveHint}
            >
              {#snippet fields()}
                <label class="field">
                  <span>Why</span>
                  <input bind:value={why} placeholder={`${open?.fresh ? 'Write' : 'Change'} ${open?.path} of the kitchen`} />
                  <span class="hint">What the lane is for, and what the log will say.</span>
                </label>
              {/snippet}
            </Editor>
          {/key}
        {:else}
          <Empty title="Pick a part of the kitchen">Its behaviour, a concept, a recipe, a tool or an instruction.</Empty>
        {/if}
        {#if waits}
          <div class="result" role="status">
            <div class="controls">
              <p class="grow">
                {#if waits.result === null}
                  <span class="mono">{waits.path}</span> waits in
                  <a class="ref" href={laneIn(k, waits.lane)}>{laneName(waits.lane)}</a> for somebody who may integrate.
                {:else}
                  <span class="mono">{waits.path}</span> is in
                  <a class="ref" href={laneIn(k, waits.lane)}>{laneName(waits.lane)}</a>, not integrated:
                  <State said={outcome(waits.result.result)} />
                  {#if waits.result.missing}<span class="soft">{humanize(waits.result.missing)}</span>{/if}
                {/if}
              </p>
              <button class="quiet sm icon" aria-label="Close" onclick={() => (waits = null)}><Icon name="close" /></button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if open && !open.fresh}
    <h2 class="section-title">Changes to {wanted ?? open.path}</h2>
    {#if historyFailed}
      <Err message={historyFailed} />
    {:else if history === null}
      <Loading lines={2} />
    {:else}
      <div class="panel table-wrap">
        <table>
          <thead>
            <tr><th>Who</th><th>What</th><th>Lane</th><th>When</th></tr>
          </thead>
          <tbody>
            {#each history as item (item.id)}
              <tr>
                <td>{item.author}</td>
                <td>{#if item.intent}<q class="reason">{item.intent}</q>{:else}{humanize(done(item))}{/if}</td>
                <td>
                  {#if !item.lane}
                    <span class="none">None</span>
                  {:else if ['main', 'lane/main'].includes(item.lane)}
                    <span class="ref">main</span>
                  {:else}
                    <a class="ref" href={laneIn(k, item.lane)}>{laneName(item.lane)}</a>
                  {/if}
                </td>
                <td class="soft"><Time ms={item.at_ms} /></td>
              </tr>
            {:else}
              <tr>
                <td colspan="4"><Empty inset title="No change recorded yet" /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="footnote">
        An earlier text is not shown here yet: to put one back, edit the file again, or work in a lane of {k} from a
        connected directory.
      </p>
    {/if}
  {/if}

  <h2 class="section-title">Repositories that use it</h2>
  <p class="section-lead">
    A repository that uses a kitchen gives the kitchen’s instructions to every assistant, before its own. Its
    maintainers say which it uses: this sets <code>kitchen</code> in its configuration.
  </p>
  {#if others.length === 0}
    <Empty title="No other repository">There is no other repository you may read that could use it.</Empty>
  {:else}
    <div class="stack">
      <div class="panel table-wrap">
        <table>
          <thead>
            <tr><th class="tick"><span class="sr">Uses it</span></th><th>Repository</th><th>Its kitchen now</th><th>You may</th></tr>
          </thead>
          <tbody>
            {#each others as one (one.name)}
              <tr>
                <td class="tick">
                  <input
                    type="checkbox"
                    aria-label={`${one.name} uses ${kitchen.title}`}
                    disabled={!mayMaintain(one.name) || choosing}
                    bind:checked={chosen[one.name]}
                  />
                </td>
                <td><a href={lanesOf(one.name)}>{one.name}</a></td>
                <td>
                  {#if one.uses === k}
                    <span class="chip accent">this one</span>
                  {:else if one.uses && one.usesFound}
                    <a href={pageOf(one.uses)}>{one.uses}</a>
                  {:else if one.uses}
                    {one.uses} <span class="chip bad">not found</span>
                  {:else}
                    <span class="soft">The standard one</span>
                  {/if}
                </td>
                <td class="soft">{mayMaintain(one.name) ? 'Change it' : `${one.role}: a maintainer changes it`}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="box">
        <div class="controls">
          <button class="primary" disabled={choosing || changes.length === 0} onclick={saveChoice}>{choosing ? 'Saving…' : 'Save'}</button>
        </div>
        <Err message={choiceFailed} />
        <p class="hint">
          A repository that is checked uses this kitchen; one that is unchecked uses the standard one again.
          {#if changes.some((one) => one.uses && one.uses !== k && chosen[one.name])}
            A repository that had another kitchen leaves it for this one.
          {/if}
        </p>
      </div>
    </div>
  {/if}
{/if}

{#snippet card(one)}
  <div class="box">
    <h3>{one.title}</h3>
    {#if one.about}<p class="soft">{one.about}</p>{/if}
    <div class="row-body">
      {#if one.title !== one.name}<span class="row-meta">The repository {one.name}</span>{/if}
      <span class="row-meta">
        {one.users.length === 0 ? 'Used by no repository' : `Used by ${count(one.users.length, 'repository', 'repositories')}`}
      </span>
      {#if !one.readable}
        <span class="row-meta">You may not read it</span>
      {:else if !one.marked}
        <span class="tag">Instructions only</span>
      {/if}
    </div>
  </div>
{/snippet}

<style>
  /* Its commands scroll inside it: a long one never makes it wider than the page. */
  .start {
    min-width: 0;
  }
  /* The column of what is checked: as wide as the box in it. */
  .tick {
    width: 36px;
  }
</style>
