<script>
  // Tasks (Kito 0.33): what needs doing in a repository, as a board by
  // where each stands, and one task with its lanes and what was said on
  // it. Anyone who may write adds tasks, says whom they are for,
  // comments, and closes them; a task is never closed by Kito itself.
  import { ask, focus, laneLink, taskLink } from './api.js';
  import { count, sentence, who } from './format.js';
  import { markdown } from './md.js';
  import { standing, taskStanding, taskWords, TASK_PLACES } from './standing.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  // `open`: the task the address names (`#/tasks?task=task%231`), if any.
  let { role = null, user = null, open: opened = null } = $props();

  let tasks = $state(null);
  let loadFailed = $state('');
  // The task looked at, whole.
  let shown = $state(null);
  // What is being done now (`add`, `close`…): its button says so, the others wait.
  let busy = $state('');
  // What did not work, and where it was asked (`shown`: the task to look
  // at, `board`: a card moved): it is said under those controls.
  let failed = $state({ at: '', message: '' });
  let comment = $state('');
  let assignee = $state('');
  let adding = $state(null);
  let dragged = $state(null);

  const mayWrite = $derived(role !== 'read');
  const failedAt = (at) => (failed.at === at ? failed.message : '');

  async function load() {
    try {
      tasks = await ask('tasks', { state: 'all' });
      loadFailed = '';
    } catch (error) {
      loadFailed = error.message;
    }
  }
  async function show(id) {
    const asked = opened;
    try {
      const task = await ask('task', { task: id });
      // A task says only the state of each of its lanes. Where an open one
      // stands, with its review and its conflicts, is the repository's to say.
      const open = task.lanes.some((lane) => lane.state !== 'closed') ? await ask('lanes').catch(() => []) : [];
      // The address may have moved on while it was asked for.
      if (opened !== asked) return;
      task.lanes = task.lanes.map((lane) => open.find((one) => one.id === lane.id) ?? lane);
      shown = task;
      assignee = task.for ?? '';
      if (failed.at === 'shown') failed = { at: '', message: '' };
    } catch (error) {
      if (opened === asked) failed = { at: 'shown', message: error.message };
    }
  }
  load();
  // The task shown is the one the address names: a card is a link to it,
  // and going back leaves it.
  $effect(() => {
    shown = null;
    if (opened) show(opened);
  });

  // One thing done to a task: its button waits, it is said, and what it
  // changed is read again. `work` may answer what to say.
  async function act(what, at, work, said = null) {
    busy = what;
    failed = { at: '', message: '' };
    try {
      const told = await work();
      toast(said ?? told);
    } catch (error) {
      failed = { at, message: error.message };
    }
    busy = '';
    await Promise.all([load(), shown ? show(shown.id) : null]);
  }

  const close = (id, at = 'task') => act('close', at, () => ask('task_done', { task: id }), `${id} closed as done`);
  const reopen = (id, at = 'task') => act('reopen', at, () => ask('task_reopen', { task: id }), `${id} reopened`);
  const drop = (id) => act('drop', 'task', () => ask('task_drop', { task: id }), `${id} dropped`);
  function assign(event) {
    event.preventDefault();
    const whom = assignee.trim();
    act('for', 'for', () => ask('task_update', { task: shown.id, for: whom }), `${shown.id} is for ${whom || 'nobody'}`);
  }
  function say(event) {
    event.preventDefault();
    if (!comment.trim()) return;
    act(
      'comment',
      'comment',
      async () => {
        await ask('task_comment', { task: shown.id, text: comment });
        comment = '';
      },
      'Comment added',
    );
  }
  function add(event) {
    event.preventDefault();
    const it = adding;
    if (!it.title.trim()) return;
    act('add', 'add', async () => {
      const made = await ask('task_add', { title: it.title, text: it.text, for: it.for.trim() || null });
      adding = null;
      // The new task is the one to look at.
      location.hash = taskLink(made.id);
      return `${made.id} added`;
    });
  }

  // A card dropped on a column: done, or open again.
  function droppedOn(place) {
    const task = tasks?.find((one) => one.id === dragged);
    dragged = null;
    if (!task || !mayWrite) return;
    if (place === 'done' && task.state !== 'done') close(task.id, 'board');
    else if (place !== 'done' && ['done', 'dropped'].includes(task.state)) reopen(task.id, 'board');
  }

  // A column holds the tasks that stand there: one an agent thinks done is ready to close.
  const inColumn = (place) => (tasks ?? []).filter((task) => taskStanding(task).place === place);
  const dropped = $derived((tasks ?? []).filter((task) => task.state === 'dropped'));
</script>

{#snippet adder()}
  <button class="primary" disabled={adding !== null} onclick={() => (adding = { title: '', text: '', for: '' })}>Add a task</button>
{/snippet}

<PageHead title="Tasks" docs="tasks" actions={mayWrite ? adder : null} />
<Err message={loadFailed || failedAt('shown') || failedAt('board')} />

{#if adding}
  <form class="panel pad narrow form" onsubmit={add}>
    <h3>Add a task</h3>
    <label class="field">
      <span>What needs doing</span>
      <input bind:value={adding.title} placeholder="Prices in cents" use:focus />
    </label>
    <label class="field">
      <span>More about it</span>
      <textarea rows="4" bind:value={adding.text}></textarea>
      <span class="hint">Markdown.</span>
    </label>
    <label class="field">
      <span>For</span>
      <input bind:value={adding.for} placeholder="bob" />
      <span class="hint">A person or an agent.</span>
    </label>
    <div class="controls">
      <button class="primary" disabled={busy !== '' || !adding.title.trim()}>{busy === 'add' ? 'Adding…' : 'Add'}</button>
      <button type="button" class="quiet" onclick={() => (adding = null)}>Cancel</button>
    </div>
    <Err message={failedAt('add')} />
  </form>
{/if}

{#if opened}
  {#if shown}
    {@const stands = taskStanding(shown)}
    <section class="panel narrow detail">
      <div class="panel-head">
        <h3>{shown.title}</h3>
        <State task={shown} />
        <span class="grow"></span>
        <a class="button quiet sm" href="#/tasks" aria-label="Close"><Icon name="close" /></a>
      </div>
      <div class="pad stack">
        <p class="soft small">
          <span class="ref">{shown.id}</span> · asked for by {shown.by}
          <Time ms={shown.at_ms} />
          {#if !mayWrite && shown.for}· for {shown.for}{/if}
          {#if shown.claimed_by}· taken up by {shown.claimed_by}{/if}
          {#if shown.source?.url}
            · from
            <a href={shown.source.url} target="_blank" rel="noreferrer">{shown.source.kind ?? 'elsewhere'} <Icon name="external" size={12} /></a>
          {/if}
        </p>
        {#if shown.text}<div class="rendered">{@html markdown(shown.text)}</div>{/if}

        <div class="box">
          <h4>Lanes</h4>
          {#if shown.lanes.length > 0}
            <ul class="panel rows tight">
              {#each shown.lanes as lane (lane.id)}
                <li>
                  <a class="row" href={laneLink(lane.id)}>
                    <span class={['ring', standing(lane).tone]} aria-hidden="true"></span>
                    <span class="row-body"><span><span class="ref">{lane.id}</span> · {who(lane.agent, lane.owner)}</span></span>
                    <span class="row-side"><State {lane} plain /></span>
                  </a>
                </li>
              {/each}
            </ul>
          {:else}
            <span class="none">None yet</span>
          {/if}
        </div>

        {#if mayWrite}
          <form class="field" onsubmit={assign}>
            <label for="task-for">For</label>
            <div class="controls">
              <input id="task-for" bind:value={assignee} placeholder="bob" />
              <button class="primary" disabled={busy !== '' || assignee.trim() === (shown.for ?? '')}>{busy === 'for' ? 'Saving…' : 'Save'}</button>
            </div>
            <span class="hint">A person or an agent.</span>
          </form>
          <Err message={failedAt('for')} />
          <div class="controls">
            {#if ['done', 'dropped'].includes(shown.state)}
              <button disabled={busy !== ''} onclick={() => reopen(shown.id)}>{busy === 'reopen' ? 'Reopening…' : 'Reopen'}</button>
            {:else}
              <button class={[stands.place === 'ready' && 'primary']} disabled={busy !== ''} onclick={() => close(shown.id)}>
                {busy === 'close' ? 'Closing…' : 'Close as done'}
              </button>
              <span class="grow"></span>
              <Confirm
                label="Drop"
                ask={`Drop ${shown.id}? Nobody will do it; it can be reopened later.`}
                working="Dropping…"
                disabled={busy !== ''}
                onyes={() => drop(shown.id)}
              />
            {/if}
          </div>
          <Err message={failedAt('task')} />
        {/if}

        <div class="box">
          <h4>Comments</h4>
          {#each shown.comments ?? [] as said (said.n)}
            <div>
              <p><b>{said.by}</b> <span class="small faint"><Time ms={said.at_ms} /></span></p>
              <div class="rendered">{@html markdown(said.text)}</div>
            </div>
          {:else}
            <span class="none">None yet</span>
          {/each}
          {#if mayWrite}
            <form class="box" onsubmit={say}>
              <textarea rows="3" bind:value={comment} aria-label="Comment"></textarea>
              <div class="controls">
                <button disabled={busy !== '' || !comment.trim()}>{busy === 'comment' ? 'Commenting…' : 'Comment'}</button>
              </div>
              <Err message={failedAt('comment')} />
            </form>
          {/if}
        </div>
      </div>
    </section>
  {:else if !failedAt('shown')}
    <Loading />
  {/if}
{/if}

{#if tasks === null}
  {#if !loadFailed}<Loading />{/if}
{:else if tasks.length === 0}
  <Empty title="No tasks yet" />
{:else}
  <div class="board">
    {#each TASK_PLACES as place (place)}
      {@const there = inColumn(place)}
      {@const title = sentence(taskWords(place))}
      <div
        class="column"
        role="group"
        aria-label={title}
        ondragover={(event) => event.preventDefault()}
        ondrop={(event) => {
          // A card is a link: dropped, it is not to be opened.
          event.preventDefault();
          droppedOn(place);
        }}
      >
        <div class="column-head"><h3>{title}</h3><span class="count">{there.length}</span></div>
        {#each there as task (task.id)}
          <a
            class="panel pad card"
            href={taskLink(task.id)}
            aria-current={task.id === shown?.id ? 'true' : undefined}
            draggable={mayWrite}
            ondragstart={() => (dragged = task.id)}
          >
            <span class="row-title">{task.title}</span>
            <span class="row-meta facts">
              <span class="ref">{task.id}</span>
              {#if task.for}<span>for {task.for === user ? 'you' : task.for}</span>{/if}
              {#if task.claimed_by}<span>taken up by {task.claimed_by}</span>{/if}
              {#each task.lanes as lane (lane.id)}<span class="ref">{lane.id}</span>{/each}
              {#if task.comment_count > 0}
                <span>
                  <span aria-hidden="true"><Icon name="comment" size={14} /> {task.comment_count}</span>
                  <span class="sr">{count(task.comment_count, 'comment')}</span>
                </span>
              {/if}
            </span>
            {#if task.thinks_done}<span class="row-meta">{task.thinks_done} thinks it is done</span>{/if}
          </a>
        {:else}
          <p class="none inset">None</p>
        {/each}
      </div>
    {/each}
  </div>
  {#if dropped.length > 0}
    <details>
      <summary>{count(dropped.length, 'dropped task')}</summary>
      <ul class="panel rows tight">
        {#each dropped as task (task.id)}
          <li>
            <a class="row" href={taskLink(task.id)} aria-current={task.id === shown?.id ? 'true' : undefined}>
              <span class="ref">{task.id}</span>
              <span class="row-title">{task.title}</span>
            </a>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
{/if}

<style>
  .detail {
    margin-bottom: 20px;
  }
  /* Where the tasks stand, a column each: four side by side, then two, then one. */
  .board {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gap);
    margin-bottom: var(--gap);
  }
  /* A well the cards lie in: a card dropped anywhere on it is in that column. */
  .column {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    align-content: start;
    min-height: 120px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius-panel);
    background: color-mix(in srgb, var(--hover) 60%, transparent);
  }
  /* Its title, and its "None", start a little inside the edge of its cards. */
  .column-head,
  .inset {
    padding-inline: 4px;
  }
  .column-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 4px;
  }
  .card {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  /* The one shown above the board. */
  .card[aria-current='true'] {
    border-color: var(--accent);
    box-shadow: var(--ring);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
  }
  @media (max-width: 900px) {
    .board {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .board {
      grid-template-columns: minmax(0, 1fr);
    }
    .column {
      min-height: 64px;
    }
  }
</style>
