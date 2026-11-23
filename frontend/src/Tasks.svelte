<script>
  // Tasks (Kito 0.33): what needs doing in a repository, as a board by
  // where each stands or as a list, narrowed by words and by whom each is
  // for; one task opens beside them. Anyone who may write adds tasks,
  // says whom they are for, starts lanes for them, comments, and closes
  // them; a task is never closed by Kito itself.
  import { tick } from 'svelte';
  import { ask, focus } from './api.js';
  import { toast } from './toast.svelte.js';
  import { filterTasks, namesOf, TASK_ORDERS } from './tasks.js';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import NamePicker from './NamePicker.svelte';
  import PageHead from './PageHead.svelte';
  import TaskBoard from './TaskBoard.svelte';
  import TaskList from './TaskList.svelte';
  import TaskPanel from './TaskPanel.svelte';

  // `open`: the task the address names (`#/tasks?task=task%231`), if any.
  let { role = null, user = null, open: opened = null } = $props();

  const mayWrite = $derived(role !== 'read');

  // How the tasks are shown, kept in the address (`view`, `q`, `for`,
  // `sort`, `dropped`) so that a link and Back show them the same. The
  // view the address says is the view; the one chosen last is kept for an
  // address that says none.
  const VIEW_KEY = 'kito-tasks-view';
  function lastView() {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board';
    } catch {
      return 'board';
    }
  }
  function fromAddress() {
    const query = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const view = query.get('view');
    const sort = query.get('sort');
    return {
      view: view === 'list' || view === 'board' ? view : lastView(),
      q: query.get('q') ?? '',
      whom: query.get('for') ?? '',
      sort: TASK_ORDERS.some(([key]) => key === sort) ? sort : 'updated',
      dropped: query.get('dropped') === '1',
    };
  }
  let chosen = $state(fromAddress());
  $effect(() => {
    const moved = () => (chosen = fromAddress());
    addEventListener('hashchange', moved);
    return () => removeEventListener('hashchange', moved);
  });

  /** The address of the page as it is shown, with `task` open beside it (null: none). */
  function addressFor(task) {
    const query = new URLSearchParams();
    if (task) query.set('task', task);
    // Always said, so that a link shows the same view whatever its reader chose last.
    query.set('view', chosen.view);
    if (chosen.q) query.set('q', chosen.q);
    if (chosen.whom) query.set('for', chosen.whom);
    if (chosen.sort !== 'updated') query.set('sort', chosen.sort);
    if (chosen.dropped) query.set('dropped', '1');
    const said = query.toString();
    return `#/tasks${said ? `?${said}` : ''}`;
  }
  // What is chosen is written into the address as it is chosen, without
  // a step of its own in the history.
  $effect(() => {
    const wanted = addressFor(opened);
    if (location.hash.startsWith('#/tasks') && location.hash !== wanted) history.replaceState(history.state, '', wanted);
  });
  function setView(view) {
    chosen.view = view;
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // A browser that keeps nothing: the address keeps it.
    }
  }

  let tasks = $state(null);
  // Every lane of the repository: where each lane of a task stands, and the agents a task can be for.
  let lanes = $state([]);
  // The repository's people, when the server says them to the reader.
  let members = $state(null);
  let loadFailed = $state('');

  async function load() {
    try {
      tasks = await ask('tasks', { state: 'all' });
      loadFailed = '';
    } catch (error) {
      loadFailed = error.message;
    }
  }
  async function loadLanes() {
    try {
      lanes = await ask('lanes', { all: true });
    } catch {
      // A task still says the state of each of its lanes.
    }
  }
  // Behind a server only, where somebody is signed in.
  async function loadMembers() {
    if (!user) return;
    try {
      const said = await ask('server.members');
      members = (said.members ?? []).map((one) => one.user);
    } catch {
      // Only a maintainer is told who uses the repository: the names seen stand for them.
    }
  }
  load();
  loadLanes();
  loadMembers();
  const changed = () => Promise.all([load(), loadLanes()]);

  const names = $derived(namesOf({ tasks, lanes, members, user }));
  const lanesById = $derived(new Map(lanes.map((lane) => [lane.id, lane])));
  const shown = $derived(filterTasks(tasks, chosen));
  const listed = $derived(chosen.dropped ? shown : shown.filter((task) => task.state !== 'dropped'));
  // Whom the tasks are for, the reader first: the choices of the filter.
  const whoms = $derived.by(() => {
    const found = new Set((tasks ?? []).map((task) => task.for).filter(Boolean));
    if (chosen.whom && chosen.whom !== 'nobody') found.add(chosen.whom);
    const others = [...found].filter((name) => name !== user).sort((a, b) => a.localeCompare(b));
    return user ? [user, ...others] : others;
  });

  // The page changed a task the panel shows: the panel reads it again.
  let stamp = $state(0);
  let moveFailed = $state('');
  // A card dropped on a column: done, or open again.
  async function move(task, place) {
    if (!mayWrite) return;
    let work = null;
    if (place === 'done' && task.state !== 'done') work = ['task_done', `${task.id} closed as done`];
    else if (place !== 'done' && ['done', 'dropped'].includes(task.state)) work = ['task_reopen', `${task.id} reopened`];
    if (!work) return;
    moveFailed = '';
    try {
      await ask(work[0], { task: task.id });
      toast(work[1]);
    } catch (error) {
      moveFailed = error.message;
    }
    await changed();
    stamp += 1;
  }

  let adding = $state(null);
  let addBusy = $state(false);
  let addFailed = $state('');
  async function add(event) {
    event.preventDefault();
    const it = adding;
    if (!it.title.trim()) return;
    addBusy = true;
    addFailed = '';
    try {
      const made = await ask('task_add', { title: it.title, text: it.text, for: it.for.trim() || null });
      adding = null;
      toast(`${made.id} added`);
      await load();
      // The new task is the one to look at.
      location.hash = addressFor(made.id);
    } catch (error) {
      addFailed = error.message;
    }
    addBusy = false;
  }

  // Escape puts the task away, unless it is said to what is being written or asked.
  $effect(() => {
    if (!opened) return;
    const key = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target.closest?.('input, textarea, select, [role="dialog"]')) return;
      location.hash = addressFor(null);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  // Put away, the reader is back at its card or its row.
  let was = null;
  $effect(() => {
    const left = was;
    was = opened;
    if (!left || opened) return;
    tick().then(() => document.querySelector(`[data-task="${CSS.escape(left)}"]`)?.focus());
  });
</script>

{#snippet views()}
  <div class="seg" role="group" aria-label="View">
    <button aria-pressed={chosen.view === 'board'} onclick={() => setView('board')}>Board</button>
    <button aria-pressed={chosen.view === 'list'} onclick={() => setView('list')}>List</button>
  </div>
{/snippet}

{#snippet adder()}
  <button class="primary" disabled={adding !== null} onclick={() => (adding = { title: '', text: '', for: '' })}>Add a task</button>
{/snippet}

<PageHead title="Tasks" docs="tasks" {views} actions={mayWrite ? adder : null} />
<Err message={loadFailed} />

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
    <div class="field">
      <span>For</span>
      <NamePicker value={adding.for} {names} {user} label="For" wide onpick={(name) => (adding.for = name)} />
    </div>
    <div class="controls">
      <button class="primary" disabled={addBusy || !adding.title.trim()}>{addBusy ? 'Adding…' : 'Add'}</button>
      <button type="button" class="quiet" onclick={() => (adding = null)}>Cancel</button>
    </div>
    <Err message={addFailed} />
  </form>
{/if}

{#if tasks === null}
  {#if !loadFailed}<Loading />{/if}
{:else}
  {#if tasks.length > 0}
    <form class="panel filters" role="search" onsubmit={(event) => event.preventDefault()}>
      <input type="search" aria-label="Search the tasks" placeholder="Search" bind:value={chosen.q} />
      <select aria-label="For" bind:value={chosen.whom}>
        <option value="">For everybody</option>
        {#each whoms as name (name)}<option value={name}>For {name === user ? 'you' : name}</option>{/each}
        <option value="nobody">For nobody</option>
      </select>
      <select aria-label="Order" bind:value={chosen.sort}>
        {#each TASK_ORDERS as [key, words] (key)}<option value={key}>{words}</option>{/each}
      </select>
      {#if chosen.view === 'list'}
        <label class="check"><input type="checkbox" bind:checked={chosen.dropped} /> Show dropped</label>
      {/if}
    </form>
  {/if}
  <Err message={moveFailed} />

  <div class={['split', opened && 'beside']}>
    <div class="shown">
      {#if tasks.length === 0}
        <Empty title="No tasks yet" />
      {:else if chosen.view === 'list'}
        <TaskList
          tasks={listed}
          lanes={lanesById}
          {names}
          {user}
          current={opened}
          hrefOf={addressFor}
          beside={Boolean(opened)}
          sort={chosen.sort}
          onsort={(key) => (chosen.sort = key)}
        />
      {:else}
        <TaskBoard tasks={shown} lanes={lanesById} {names} {user} current={opened} hrefOf={addressFor} {mayWrite} beside={Boolean(opened)} onmove={move} />
      {/if}
    </div>
    {#if opened}
      {#key opened}
        <TaskPanel id={opened} {role} {user} {lanes} {names} {stamp} closeHref={addressFor(null)} onchanged={changed} />
      {/key}
    {/if}
  </div>
{/if}

<style>
  /* The tasks, and the one open beside them: about 520 wide on a wide screen. */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .split.beside {
    grid-template-columns: minmax(0, 1fr) clamp(380px, 45%, 520px);
  }
  .shown {
    min-width: 0;
  }
  /* Under 900 the task is the whole window, over the tasks. */
  @media (max-width: 900px) {
    .split.beside {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
