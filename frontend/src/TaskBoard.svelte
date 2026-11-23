<script>
  // The tasks as a board, a column for each place a task can stand, and
  // the dropped ones under it. A card is moved to another column to close
  // its task as done, or to open it again.
  import { laneLink } from './api.js';
  import { count, laneName, sentence } from './format.js';
  import { taskStanding, taskWords, TASK_PLACES } from './standing.js';
  import Icon from './Icon.svelte';
  import Someone from './Someone.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  // `tasks`: those to show, in order, the dropped ones too. `lanes`: the
  // repository's, by id. `current`: the task shown beside the board.
  // `hrefOf(id)`: the address of a task. `beside`: a task is shown beside
  // the board, which has half the room. `onmove(task, place)`: a card was
  // dropped on a column.
  let { tasks, lanes, names, user = null, current = null, hrefOf, mayWrite = false, beside = false, onmove } = $props();

  let dragged = $state(null);

  // A column holds the tasks that stand there: one an agent thinks done is ready to close.
  const inColumn = (place) => tasks.filter((task) => taskStanding(task).place === place);
  const dropped = $derived(tasks.filter((task) => task.state === 'dropped'));

  function droppedOn(place) {
    const task = tasks.find((one) => one.id === dragged);
    dragged = null;
    if (task) onmove(task, place);
  }
</script>

<div class={['board', beside && 'beside']}>
  {#each TASK_PLACES as place (place)}
    {@const there = inColumn(place)}
    {@const title = sentence(taskWords(place))}
    <div
      class="column"
      role="group"
      aria-label={title}
      ondragover={(event) => event.preventDefault()}
      ondrop={(event) => {
        // What is dragged holds a link: dropped, it is not to be opened.
        event.preventDefault();
        droppedOn(place);
      }}
    >
      <div class="column-head"><h3>{title}</h3><span class="count">{there.length}</span></div>
      {#each there as task (task.id)}
        <article
          class={['panel', 'card', task.id === current && 'current']}
          draggable={mayWrite}
          ondragstart={(event) => {
            // The card is what moves, not the link that covers it; a browser that moves nothing without words is given its id.
            event.dataTransfer.setData('text/plain', task.id);
            dragged = task.id;
          }}
          ondragend={() => (dragged = null)}
        >
          <a
            class="row-title card-title"
            href={hrefOf(task.id)}
            draggable="false"
            data-task={task.id}
            aria-current={task.id === current ? 'true' : undefined}>{task.title}</a
          >
          <span class="row-meta facts">
            <span class="ref">{task.id}</span>
            {#if task.for}<Someone name={task.for} {names} {user} />{/if}
            {#if task.claimed_by}<Someone name={task.claimed_by} {names} {user} agent said="taken up by" />{/if}
            {#each task.lanes as one (one.id)}
              <span class="above">
                <a class="ref" href={laneLink(one.id)}>{laneName(one.id)}</a>
                <State lane={lanes.get(one.id) ?? one} plain />
              </span>
            {/each}
            {#if task.comment_count > 0}
              <span>
                <span aria-hidden="true"><Icon name="comment" size={14} /> {task.comment_count}</span>
                <span class="sr">{count(task.comment_count, 'comment')}</span>
              </span>
            {/if}
            <Time ms={task.updated_ms} />
          </span>
          {#if task.thinks_done}<span class="row-meta">{task.thinks_done} thinks it is done</span>{/if}
        </article>
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
          <a class="row" href={hrefOf(task.id)} data-task={task.id} aria-current={task.id === current ? 'true' : undefined}>
            <span class="ref">{task.id}</span>
            <span class="row-title">{task.title}</span>
          </a>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  /* Where the tasks stand, a column each: four side by side, then two, then one. */
  .board {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gap);
    margin-bottom: var(--gap);
  }
  /* With a task beside it, two by two: a card keeps room for its line. */
  .board.beside {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* A well the cards lie in: a card dropped anywhere on it is in that column. */
  .column {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
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
    padding-block: 4px;
  }
  /* A card: its title, and one line of facts under it. The whole of it opens the task. */
  .card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    padding: 10px 12px;
    transition: border-color 0.12s;
  }
  .card:hover {
    border-color: var(--line-strong);
  }
  .card-title {
    color: inherit;
  }
  .card-title:hover {
    text-decoration: none;
  }
  .card-title::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .card-title:focus-visible {
    outline: none;
  }
  .card:has(.card-title:focus-visible) {
    border-color: var(--accent);
  }
  /* The one shown beside the board. */
  .card.current {
    border-color: var(--accent);
    box-shadow: var(--ring);
  }
  /* What is pressed on the card for itself, over the link of the whole card. */
  .above {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
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
    .board,
    .board.beside {
      grid-template-columns: minmax(0, 1fr);
    }
    .column {
      min-height: 64px;
    }
  }
</style>
