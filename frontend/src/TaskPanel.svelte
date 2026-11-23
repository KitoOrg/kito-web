<script>
  // One task, beside the board or the list of tasks: its title and its
  // text, whom it is for, its lanes and where each stands, and what
  // happened to it with what was said on it. Whoever may write changes
  // them here, starts a lane for it, comments, and closes it; a task is
  // never closed by Kito itself, and no agent is started by it either.
  import { tick } from 'svelte';
  import { ask, laneLink } from './api.js';
  import { count, laneName, laneTitle, scopeItems, who } from './format.js';
  import { placeWords, standing, taskStanding } from './standing.js';
  import { happenings } from './tasks.js';
  import { markdown } from './md.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import CopyLine from './CopyLine.svelte';
  import Editor from './Editor.svelte';
  import Err from './Err.svelte';
  import Face from './Face.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import NamePicker from './NamePicker.svelte';
  import ScopeField from './ScopeField.svelte';
  import Someone from './Someone.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  // `id`: the task (`task#3`). `lanes`: every lane of the repository, as
  // `lanes {all}` says them. `names`: who a task can be for (tasks.js).
  // `stamp`: changes when the page changed the task, to read it again.
  // `closeHref`: the address without it. `onchanged`: the page reads
  // the tasks and the lanes again.
  let { id, role = null, user = null, lanes = [], names, stamp = 0, closeHref, onchanged } = $props();

  const mayWrite = $derived(role !== 'read');
  let task = $state(null);
  let loadFailed = $state('');
  // What is being done now: its button says so, the others wait.
  let busy = $state('');
  // What did not work, and where it was asked: said under that control.
  let failed = $state({ at: '', message: '' });
  const failedAt = (at) => (failed.at === at ? failed.message : '');
  let heading = $state(null);
  let comment = $state('');

  async function show() {
    try {
      task = await ask('task', { task: id });
      loadFailed = '';
    } catch (error) {
      loadFailed = error.message;
    }
  }
  // The first time it is shown, the reader is at its title.
  let first = true;
  $effect(() => {
    stamp;
    show().then(async () => {
      if (!first || !task) return;
      first = false;
      await tick();
      heading?.focus({ preventScroll: true });
    });
  });

  // One thing done to the task: its button waits, it is said, and what it
  // changed is read again. `work` may answer what to say. Whether it worked.
  async function act(what, at, work, said = null) {
    busy = what;
    failed = { at: '', message: '' };
    try {
      const told = await work();
      toast(said ?? told);
    } catch (error) {
      failed = { at, message: error.message };
      busy = '';
      return false;
    }
    busy = '';
    await Promise.all([show(), onchanged()]);
    return true;
  }

  // The title, while it is written over (null: it is not).
  let titling = $state(null);
  async function backToTitle() {
    await tick();
    heading?.focus();
  }
  async function saveTitle(event) {
    event.preventDefault();
    const title = titling.trim();
    if (!title) return;
    if (title === task.title) {
      titling = null;
      return backToTitle();
    }
    if (await act('title', 'title', () => ask('task_update', { task: id, title }), 'Title saved')) {
      titling = null;
      backToTitle();
    }
  }
  async function saveText(text) {
    await ask('task_update', { task: id, text });
    toast('Description saved');
    await Promise.all([show(), onchanged()]);
  }
  const pickFor = (whom) => act('for', 'for', () => ask('task_update', { task: id, for: whom }), `${id} is for ${whom || 'nobody'}`);
  const close = () => act('close', 'task', () => ask('task_done', { task: id }), `${id} closed as done`);
  const reopen = () => act('reopen', 'task', () => ask('task_reopen', { task: id }), `${id} reopened`);
  const drop = () => act('drop', 'task', () => ask('task_drop', { task: id }), `${id} dropped`);
  function say(event) {
    event.preventDefault();
    if (!comment.trim()) return;
    act(
      'comment',
      'comment',
      async () => {
        await ask('task_comment', { task: id, text: comment });
        comment = '';
      },
      'Comment added',
    );
  }

  // Its lanes, as the repository says them (with their review and their
  // conflicts); the closed ones last.
  let taskLanes = $derived(
    (task?.lanes ?? [])
      .map((lane) => lanes.find((one) => one.id === lane.id) ?? lane)
      .sort((a, b) => Number(a.state === 'closed') - Number(b.state === 'closed')),
  );

  // A lane to open for it, while its form is open; and the one just opened.
  let starting = $state(null);
  let opened = $state(null);
  function startWork() {
    opened = null;
    failed = { at: '', message: '' };
    const agent = task.for && names.isAgent(task.for) ? task.for : (task.claimed_by ?? '');
    starting = { agent, intent: task.title, scope: '' };
  }
  async function open(event) {
    event.preventDefault();
    const it = starting;
    const done = await act('open', 'open', async () => {
      opened = await ask('open_lane', { agent: it.agent.trim(), intent: it.intent.trim(), scope: scopeItems(it.scope), task: id });
      return `${laneName(opened.id)} opened`;
    });
    if (done) starting = null;
  }

  let happened = $derived(task ? happenings(task) : []);
  let stands = $derived(task ? taskStanding(task) : null);

  // Beside the tasks, it ends where the window does when the page is at
  // its top: as tall as the room under where it starts. Under 900 it is
  // the whole window, and its height is the stylesheet's.
  let side = $state(null);
  let tall = $state(null);
  function measure() {
    const split = side?.parentElement;
    if (!split || matchMedia('(max-width: 900px)').matches) {
      tall = null;
      return;
    }
    const start = split.getBoundingClientRect().top + scrollY;
    const main = side.closest('main');
    const under = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
    tall = Math.max(240, Math.min(innerHeight - 32, innerHeight - start - under));
  }
  $effect(() => {
    measure();
    // What is above it may grow or shrink (a form opened over the tasks): measured again.
    const watcher = new ResizeObserver(() => measure());
    watcher.observe(document.body);
    addEventListener('resize', measure);
    return () => {
      watcher.disconnect();
      removeEventListener('resize', measure);
    };
  });
  let over = $derived(task ? ['done', 'dropped'].includes(task.state) : false);
</script>

{#snippet lane(entry)}<a class="ref" href={laneLink(entry.lane)}>{laneName(entry.lane)}</a>{/snippet}

<aside bind:this={side} class="panel side" aria-label={task?.title ?? id} style:max-height={tall ? `${tall}px` : null}>
  <div class="panel-head">
    {#if task}<State {task} />{/if}
    <span class="grow"></span>
    <a class="button quiet sm" href={closeHref} aria-label="Close"><Icon name="close" /></a>
  </div>

  {#if !task}
    <div class="pad">
      {#if loadFailed}<Err message={loadFailed} />{:else}<Loading />{/if}
    </div>
  {:else}
    <div class="body pad stack">
      <Err message={loadFailed} />
      <div class="box">
        {#if titling !== null}
          <form class="controls" onsubmit={saveTitle}>
            <input
              class="grow"
              bind:value={titling}
              aria-label="Title"
              use:focusAndSelect
              onkeydown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                titling = null;
                backToTitle();
              }}
            />
            <button class="primary" disabled={busy !== '' || !titling.trim() || titling.trim() === task.title}
              >{busy === 'title' ? 'Saving…' : 'Save'}</button
            >
            <button type="button" class="quiet" onclick={() => ((titling = null), backToTitle())}>Cancel</button>
          </form>
          <Err message={failedAt('title')} />
        {:else}
          <h2 class="task-title" tabindex="-1" bind:this={heading}>
            {#if mayWrite}
              <button class="bare retitle" aria-label={`${task.title}, edit the title`} onclick={() => (titling = task.title)}>{task.title}</button>
            {:else}
              {task.title}
            {/if}
          </h2>
        {/if}
        <p class="small soft">
          <span class="ref">{task.id}</span> · asked by {task.by}
          <Time ms={task.at_ms} />
          {#if task.source?.url}
            · from
            <a href={task.source.url} target="_blank" rel="noreferrer">{task.source.kind ?? 'elsewhere'} <Icon name="external" size={12} /></a>
          {/if}
        </p>
      </div>

      {#if mayWrite || task.text.trim()}
        {#key task.id}
          <Editor name="Description" md plain text={task.text} editable={mayWrite} blank="Add a description" onsave={saveText} />
        {/key}
      {/if}

      <dl class="kv">
        <dt>For</dt>
        <dd>
          {#if mayWrite}
            <NamePicker value={task.for ?? ''} {names} {user} label="For" small disabled={busy !== ''} onpick={pickFor} />
          {:else if task.for}
            <Someone name={task.for} {names} {user} named />
          {:else}
            <span class="none">Nobody</span>
          {/if}
          <Err message={failedAt('for')} />
        </dd>
        {#if task.claimed_by}
          <dt>Taken up by</dt>
          <dd><Someone name={task.claimed_by} {names} {user} agent named /></dd>
        {/if}
      </dl>

      <section class="box">
        <div class="head">
          <h4 class="grow">Lanes</h4>
          {#if mayWrite && !over}
            <button class="sm" aria-expanded={starting !== null} disabled={starting !== null} onclick={startWork}>Start work</button>
          {/if}
        </div>
        {#if starting}
          <form class="panel pad stack" onsubmit={open}>
            <div class="field">
              <span>Agent</span>
              <NamePicker value={starting.agent} {names} {user} label="Agent" wide nobody={false} people={false} empty="Choose" onpick={(name) => (starting.agent = name)} />
            </div>
            <label class="field">
              <span>Why</span>
              <input bind:value={starting.intent} placeholder="prices in cents" />
            </label>
            <ScopeField bind:value={starting.scope} />
            <div class="controls">
              <button class="primary" disabled={busy !== '' || !starting.agent.trim() || !starting.intent.trim() || !starting.scope.trim()}>
                {busy === 'open' ? 'Opening…' : 'Open'}
              </button>
              <button type="button" class="quiet" onclick={() => (starting = null)}>Cancel</button>
            </div>
            <Err message={failedAt('open')} />
          </form>
        {/if}
        {#if opened}
          <div class="result" role="status">
            <div class="controls">
              <p class="grow"><a class="ref" href={laneLink(opened.id)}>{laneName(opened.id)}</a> is open for {opened.agent}.</p>
              <button class="quiet sm icon" aria-label="Close" onclick={() => (opened = null)}><Icon name="close" /></button>
            </div>
            {#if user}
              <span>In a directory connected to this server:</span>
              <CopyLine text={`kito lane attach ${opened.id} --write`} />
            {:else if opened.workdir}
              <span>Its working copy:</span>
              <CopyLine text={opened.workdir} />
            {/if}
          </div>
        {/if}
        {#if taskLanes.length > 0}
          <ul class="panel rows tight">
            {#each taskLanes as one (one.id)}
              {@const place = standing(one).place}
              {@const title = laneTitle(one)}
              <li class={[one.state === 'closed' && 'past']}>
                <div class="row">
                  <span class={['ring', standing(one).tone]} aria-hidden="true"></span>
                  <span class="row-body">
                    <span>
                      <a class="ref" href={laneLink(one.name ?? one.id)}>{laneName(one.name ?? one.id)}</a>
                      {#if title}<span class="row-title">{title}</span>{/if}
                    </span>
                    <span class="row-meta facts">
                      <span class="who"><Face name={one.agent} agent assistant={one.assistant} small />{who(one.agent, one.owner)}</span>
                      {#if one.state !== 'closed' && one.files}<span>{count(one.files.length, 'file')}</span>{/if}
                      {#if place === 'review' && one.review}<span>{one.review}</span>{/if}
                      {#if one.conflicts?.length > 0 && place !== 'conflicts'}<span>{count(one.conflicts.length, 'conflict')}</span>{/if}
                      {#if one.out_of_scope?.length > 0 && place !== 'outside'}<span>{placeWords('outside')}</span>{/if}
                    </span>
                  </span>
                  <span class="row-side lane-state">
                    {#if ['approved', 'changes'].includes(place) && one.review}
                      <span class="tag">{one.review}</span>
                    {:else}
                      <State lane={one} plain />
                    {/if}
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {:else if !starting}
          <span class="none">None yet</span>
        {/if}
      </section>

      {#if happened.length > 0 || mayWrite}
      <section class="box">
        <h4>Activity</h4>
        <ol class="happened">
          {#each happened as entry (entry.key)}
            <li>
              {#if entry.what === 'comment'}
                <div class="box">
                  <p><b>{entry.said.by}</b> <span class="small faint"><Time ms={entry.said.at_ms} /></span></p>
                  <div class="rendered">{@html markdown(entry.said.text)}</div>
                </div>
              {:else}
                <p class="small soft">
                  {#if entry.what === 'edited'}
                    {entry.by} edited it
                  {:else if entry.what === 'for'}
                    {entry.by} gave it to {entry.for || 'nobody'}
                  {:else if entry.what === 'taken_up'}
                    {entry.agent ?? entry.by} took it up
                  {:else if entry.what === 'lane_opened'}
                    {entry.by} opened {@render lane(entry)}
                  {:else if entry.what === 'lane_integrated'}
                    {@render lane(entry)} was integrated
                  {:else if entry.what === 'lane_closed'}
                    {@render lane(entry)} was closed
                  {:else if entry.what === 'thinks_done'}
                    {entry.agent ?? entry.by} thinks it is done
                  {:else if entry.what === 'done'}
                    {entry.by} closed it as done
                  {:else if entry.what === 'reopened'}
                    {entry.by} reopened it
                  {:else if entry.what === 'dropped'}
                    {entry.by} dropped it
                  {:else}
                    {entry.by} · {String(entry.what).replaceAll('_', ' ')}
                  {/if}
                  · <Time ms={entry.at_ms} />
                </p>
              {/if}
            </li>
          {/each}
        </ol>
        {#if mayWrite}
          <form class="box" onsubmit={say}>
            <textarea rows="3" bind:value={comment} aria-label="Comment"></textarea>
            <div class="controls">
              <button disabled={busy !== '' || !comment.trim()}>{busy === 'comment' ? 'Commenting…' : 'Comment'}</button>
            </div>
            <Err message={failedAt('comment')} />
          </form>
        {/if}
      </section>
      {/if}
    </div>

    {#if mayWrite}
      <div class="panel-foot">
        {#if over}
          <button class="sm" disabled={busy !== ''} onclick={reopen}>{busy === 'reopen' ? 'Reopening…' : 'Reopen'}</button>
        {:else}
          <button class={['sm', stands.place === 'ready' && 'primary']} disabled={busy !== ''} onclick={close}>
            {busy === 'close' ? 'Closing…' : 'Close as done'}
          </button>
          <span class="grow"></span>
          <Confirm
            sm
            label="Drop"
            ask={`Drop ${id}? Nobody will do it; it can be reopened later.`}
            working="Dropping…"
            disabled={busy !== ''}
            onyes={drop}
          />
        {/if}
        {#if failedAt('task')}<div class="foot-said"><Err message={failedAt('task')} /></div>{/if}
      </div>
    {/if}
  {/if}
</aside>

<script module>
  /** The cursor in the field, with what is in it chosen: written over as one types. */
  function focusAndSelect(node) {
    node.focus();
    node.select();
  }
</script>

<style>
  /* Beside the tasks, as tall as the window, its foot always in sight: what is in it scrolls. */
  .side {
    position: sticky;
    top: 16px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 32px);
    min-width: 0;
    overflow: hidden;
  }
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .task-title {
    overflow-wrap: anywhere;
  }
  /* The title is pressed to be written over. */
  .retitle {
    margin: -2px -4px;
    padding: 2px 4px;
    border-radius: var(--radius);
    color: inherit;
    cursor: text;
  }
  .retitle:hover {
    background: var(--hover);
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 10px;
  }
  /* Where a lane stands: at the end of its first line, at every width. */
  .row > .lane-state {
    flex: none;
    flex-basis: auto;
    align-self: flex-start;
    margin-left: auto;
    padding-left: 0;
    white-space: nowrap;
  }
  /* A closed lane of it: there, and quieter. */
  .past {
    opacity: 0.7;
  }
  .happened {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .foot-said {
    flex-basis: 100%;
  }
  /* Under 900 it is the whole window, over the tasks. */
  @media (max-width: 900px) {
    .side {
      position: fixed;
      inset: 0;
      z-index: 25;
      max-height: none;
      border: 0;
      border-radius: 0;
    }
  }
</style>
