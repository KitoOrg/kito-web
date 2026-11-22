<script>
  // Tasks (Kito 0.33): what needs doing in a repository, as a board by
  // where each stands, and one task with its lanes and what was said on
  // it. Anyone who may write asks for tasks, says whom they are for,
  // comments, and closes them; a task is never closed by Kito itself.
  import { ago, ask, laneLink } from './api.js';
  import { markdown } from './md.js';

  let { role = null, user = null, open: opened = null } = $props();

  const columns = [
    ['open', 'To do'],
    ['in_lane', 'In a lane'],
    ['ready', 'Ready to close'],
    ['done', 'Done'],
  ];

  let tasks = $state(null);
  let failed = $state('');
  let busy = $state(false);
  let showDropped = $state(false);
  // The task looked at, whole.
  let shown = $state(null);
  let comment = $state('');
  let assignee = $state('');
  let adding = $state(null);
  let dragged = $state(null);

  const mayWrite = $derived(role !== 'read');

  async function load() {
    try {
      tasks = await ask('tasks', { state: 'all' });
      failed = '';
      if (shown) await show(shown.id);
    } catch (error) {
      failed = error.message;
    }
  }
  async function show(id) {
    try {
      shown = await ask('task', { task: id });
      assignee = shown.for ?? '';
    } catch (error) {
      failed = error.message;
    }
  }
  load().then(() => opened && show(opened));

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

  const close = (id) => act(() => ask('task_done', { task: id }));
  const reopen = (id) => act(() => ask('task_reopen', { task: id }));
  const drop = (id) => confirm(`Drop ${id}? Nobody will do it.`) && act(() => ask('task_drop', { task: id }));
  const assign = () => act(() => ask('task_update', { task: shown.id, for: assignee.trim() }));
  function say(event) {
    event.preventDefault();
    if (!comment.trim()) return;
    act(async () => {
      await ask('task_comment', { task: shown.id, text: comment });
      comment = '';
    });
  }
  function add(event) {
    event.preventDefault();
    const it = adding;
    if (!it.title.trim()) return;
    act(async () => {
      const made = await ask('task_add', { title: it.title, text: it.text, for: it.for.trim() || null });
      adding = null;
      shown = made;
    });
  }

  // A card dropped on a column: done, or open again.
  function droppedOn(column) {
    const task = tasks?.find((one) => one.id === dragged);
    dragged = null;
    if (!task || !mayWrite) return;
    if (column === 'done' && task.state !== 'done') close(task.id);
    else if (column !== 'done' && ['done', 'dropped'].includes(task.state)) reopen(task.id);
  }

  const inColumn = (column) => (tasks ?? []).filter((task) => task.state === column);
  const dropped = $derived((tasks ?? []).filter((task) => task.state === 'dropped'));
</script>

<div class="top">
  <h1>Tasks</h1>
  <span class="grow"></span>
  {#if mayWrite}<button class="primary" onclick={() => (adding = { title: '', text: '', for: '' })}>Ask for something</button>{/if}
</div>
<p class="soft">
  What needs doing here, and the lanes that do it. Open a lane for a task with <code>kito lane open … --task task#3</code>;
  agents take one up when you tell them to. A task is closed by a person, once its lanes are.
</p>
{#if failed}<p class="error" role="alert">{failed}</p>{/if}

{#if adding}
  <form class="panel add" onsubmit={add}>
    <input placeholder="What needs doing" bind:value={adding.title} />
    <textarea rows="4" placeholder="More about it (markdown)" bind:value={adding.text}></textarea>
    <div class="row">
      <input placeholder="For whom (a person or an agent)" bind:value={adding.for} />
      <button class="primary" disabled={busy || !adding.title.trim()}>Add</button>
      <button type="button" class="quiet" onclick={() => (adding = null)}>Cancel</button>
    </div>
  </form>
{/if}

{#if tasks === null && !failed}
  <p class="soft">…</p>
{:else if tasks}
  <div class="board">
    {#each columns as [column, title]}
      <section
        class="column"
        role="list"
        ondragover={(event) => event.preventDefault()}
        ondrop={() => droppedOn(column)}
      >
        <h2>{title} <span class="faint">{inColumn(column).length}</span></h2>
        {#each inColumn(column) as task (task.id)}
          <button
            class="card panel"
            class:current={shown?.id === task.id}
            draggable={mayWrite}
            ondragstart={() => (dragged = task.id)}
            onclick={() => show(task.id)}
          >
            <span class="mono faint">{task.id}</span>
            <span class="title">{task.title}</span>
            <span class="meta">
              {#if task.for}<span class="chip" class:mine={task.for === user}>for {task.for}</span>{/if}
              {#if task.claimed_by}<span class="chip">{task.claimed_by}</span>{/if}
              {#each task.lanes as lane}<span class="chip">{lane.id.replace('lane/', '#')}</span>{/each}
              {#if task.comment_count > 0}<span class="faint">💬 {task.comment_count}</span>{/if}
              {#if task.thinks_done}<span class="chip ok">{task.thinks_done} thinks it is done</span>{/if}
            </span>
          </button>
        {/each}
      </section>
    {/each}
  </div>
  {#if dropped.length > 0}
    <button class="quiet" onclick={() => (showDropped = !showDropped)}>{showDropped ? 'Hide' : 'Show'} {dropped.length} dropped</button>
    {#if showDropped}
      {#each dropped as task}<button class="quiet mono" onclick={() => show(task.id)}>{task.id} {task.title}</button>{/each}
    {/if}
  {/if}

  {#if shown}
    <section class="panel detail">
      <div class="row">
        <span class="mono faint">{shown.id}</span>
        <h2>{shown.title}</h2>
        <span class="grow"></span>
        <button class="quiet" onclick={() => (shown = null)}>Close</button>
      </div>
      <p class="faint">
        Asked for by {shown.by}, {ago(shown.at_ms)}{#if shown.claimed_by}; taken up by {shown.claimed_by}{/if}{#if shown.source?.url}; from <a href={shown.source.url} target="_blank" rel="noreferrer">{shown.source.kind ?? 'elsewhere'}</a>{/if}.
      </p>
      {#if shown.text}<div class="rendered">{@html markdown(shown.text)}</div>{/if}

      <div class="row">
        <strong>Lanes</strong>
        {#each shown.lanes as lane}
          <a class="chip" href={laneLink(lane.id)}>{lane.id} · {lane.agent} · {lane.state}</a>
        {:else}<span class="faint">none yet</span>{/each}
      </div>

      {#if mayWrite}
        <div class="row">
          <strong>For</strong>
          <input placeholder="nobody" bind:value={assignee} />
          <button disabled={busy || assignee.trim() === (shown.for ?? '')} onclick={assign}>Save</button>
          <span class="grow"></span>
          {#if ['done', 'dropped'].includes(shown.state)}
            <button disabled={busy} onclick={() => reopen(shown.id)}>Reopen</button>
          {:else}
            <button class="primary" disabled={busy} onclick={() => close(shown.id)}>
              {shown.state === 'ready' || shown.thinks_done ? 'It is done' : 'Close as done'}
            </button>
            <button class="quiet" disabled={busy} onclick={() => drop(shown.id)}>Drop</button>
          {/if}
        </div>
      {/if}

      <h3>What was said</h3>
      {#each shown.comments ?? [] as said}
        <div class="said">
          <span><b>{said.by}</b> <span class="faint">{ago(said.at_ms)}</span></span>
          <div class="rendered">{@html markdown(said.text)}</div>
        </div>
      {:else}<p class="faint">Nothing yet.</p>{/each}
      {#if mayWrite}
        <form class="row" onsubmit={say}>
          <input class="wide" placeholder="Say something: the agents in its lanes are told" bind:value={comment} />
          <button disabled={busy || !comment.trim()}>Say it</button>
        </form>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .top,
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .grow {
    flex: 1;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 12px 0;
  }
  @media (max-width: 860px) {
    .board {
      grid-template-columns: 1fr 1fr;
    }
  }
  .column {
    min-height: 120px;
    padding: 4px;
    border-radius: 8px;
    background: rgba(127, 127, 127, 0.06);
  }
  .column h2 {
    font-size: 13px;
    margin: 6px 6px 8px;
  }
  .card {
    display: grid;
    gap: 4px;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    margin-bottom: 6px;
    color: inherit;
    cursor: pointer;
  }
  .card.current {
    outline: 2px solid var(--accent);
  }
  .card .title {
    font-weight: 600;
  }
  .meta {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    font-size: 12px;
  }
  .chip.mine {
    outline: 1px solid var(--accent);
  }
  .detail,
  .add {
    padding: 12px 16px;
    margin: 12px 0;
    display: grid;
    gap: 8px;
  }
  .detail h2,
  .detail h3 {
    margin: 0;
  }
  .detail h3 {
    font-size: 14px;
    margin-top: 8px;
  }
  .said {
    border-left: 2px solid var(--line);
    padding-left: 10px;
  }
  .wide {
    flex: 1;
  }
  input,
  textarea {
    font: inherit;
    font-size: 13px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
  }
  .rendered {
    font-size: 14px;
    line-height: 1.5;
  }
</style>
