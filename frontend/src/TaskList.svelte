<script>
  // The tasks as a table, one a row: what each is, where it stands, whom
  // it is for, its lanes, and when it last changed. A row opens its task;
  // the heads of id, state and last change put the rows in that order.
  import { laneLink } from './api.js';
  import { count, laneName } from './format.js';
  import Empty from './Empty.svelte';
  import Icon from './Icon.svelte';
  import Someone from './Someone.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  // As TaskBoard's; and `sort`, the order of the rows (tasks.js
  // TASK_ORDERS), with `onsort(key)` when a head is pressed.
  let { tasks, lanes, names, user = null, current = null, hrefOf, beside = false, sort, onsort } = $props();

  // The heads that order the rows, and which way each does.
  const ways = { id: 'ascending', state: 'ascending', updated: 'descending' };
</script>

{#snippet head(key, words, kind = '')}
  <th class={kind || undefined} aria-sort={sort === key ? ways[key] : undefined}>
    <button class="bare sorter" onclick={() => onsort(key)}>
      {words}
      {#if sort === key}<Icon name={ways[key] === 'ascending' ? 'chevron-up' : 'chevron-down'} size={12} />{/if}
    </button>
  </th>
{/snippet}

<div class="panel table-wrap">
  <table class={[beside && 'beside']}>
    <thead>
      <tr>
        {@render head('id', 'Id')}
        <th>Title</th>
        {@render head('state', 'State')}
        <th class="wide">For</th>
        <th class="wide more">Lanes</th>
        <th class="wide more"><Icon name="comment" size={14} /><span class="sr">Comments</span></th>
        {@render head('updated', 'Updated', 'updated')}
      </tr>
    </thead>
    <tbody>
      {#each tasks as task (task.id)}
        <!-- The whole row opens the task for whoever points; its title is the link for the keyboard. -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <tr
          class={['task-row', task.id === current && 'current']}
          onclick={(event) => {
            if (!event.target.closest('a, button')) location.hash = hrefOf(task.id);
          }}
        >
          <td class="ref">{task.id}</td>
          <td class="title">
            <a class="row-title row-link" href={hrefOf(task.id)} data-task={task.id} aria-current={task.id === current ? 'true' : undefined}>{task.title}</a>
            {#if task.thinks_done}<span class="small soft">{task.thinks_done} thinks it is done</span>{/if}
          </td>
          <td><State {task} /></td>
          <td class="wide">
            {#if task.for}<Someone name={task.for} {names} {user} named />{:else}<span class="none">Nobody</span>{/if}
          </td>
          <td class="wide more">
            <div class="items">
              {#each task.lanes as one (one.id)}
                <span><a class="ref" href={laneLink(one.id)}>{laneName(one.id)}</a> <State lane={lanes.get(one.id) ?? one} plain /></span>
              {:else}
                <span class="none">None</span>
              {/each}
            </div>
          </td>
          <td class="wide more soft">
            {#if task.comment_count > 0}
              <span aria-hidden="true">{task.comment_count}</span><span class="sr">{count(task.comment_count, 'comment')}</span>
            {/if}
          </td>
          <td class="soft updated"><Time ms={task.updated_ms} /></td>
        </tr>
      {:else}
        <tr>
          <td colspan="7"><Empty inset title="No task matches" /></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .sorter {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: inherit;
    font-weight: 500;
    cursor: pointer;
  }
  .sorter:hover {
    color: var(--ink);
  }
  .task-row {
    cursor: pointer;
  }
  .task-row.current td {
    background: var(--accent-wash);
  }
  .title {
    min-width: 200px;
  }
  .row-link {
    display: block;
    color: inherit;
  }
  .items {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
  }
  .updated {
    white-space: nowrap;
  }
  /* With a task beside it, the table keeps what says most. */
  .beside .more {
    display: none;
  }
  /* A phone: what a task is, and where it stands. */
  @media (max-width: 640px) {
    .wide,
    .updated {
      display: none;
    }
    .title {
      min-width: 0;
    }
  }
</style>
