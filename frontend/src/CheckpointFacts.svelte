<script>
  // Who made a checkpoint (the agent of the lane it came from, for whom,
  // in what), the lane and the task it came from, and when: said under
  // its title in the history, and at the head of its page.
  import { laneLink, taskLink } from './api.js';
  import { laneName, tasked, who } from './format.js';
  import Face from './Face.svelte';
  import Time from './Time.svelte';

  let { point } = $props();

  let maker = $derived(point.agent ?? point.by);
</script>

<span class="maker"><Face name={maker} agent={Boolean(point.agent)} assistant={point.assistant} small />{who(maker, point.for)}</span>
{#if point.lane}· <a class="ref" href={laneLink(point.lane)}>{laneName(point.lane)}</a>{/if}
{#if tasked(point)}· <a class="ref" href={taskLink(point.task)}>{point.task}</a>{/if}
{#if point.on}· on <a class="ref" href={laneLink(point.on)}>{point.on}</a>{/if}
{#if point.at_ms}· <Time ms={point.at_ms} />{/if}

<style>
  .maker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    vertical-align: middle;
  }
</style>
