<script>
  // Integrating a lane: asked for from the review bar, waited for here,
  // and what came of it. Integrated, it is said in passing; anything else
  // stays under the head of the page, with what there is to do about it.
  import { ask } from './api.js';
  import { heldFor } from './checks.js';
  import { count, laneName } from './format.js';
  import { noReason, outcome, standing } from './standing.js';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import State from './State.svelte';
  import { toast } from './toast.svelte.js';

  // `talk`: the address of the part of the page where conflicts are
  // decided; `checks`: of the one that lists what has no reason yet.
  let { lane, info, changed, talk, checks } = $props();

  // What is waited for, while it is.
  let waiting = $state('');
  let result = $state(null);
  let failed = $state('');

  export async function integrate() {
    waiting = 'Asking to integrate…';
    failed = '';
    result = null;
    try {
      const asked = await ask('request_integration', { lane });
      // The answer waits for the result; a long check is asked about again.
      let ended = null;
      while (ended === null) {
        const job = await ask('integration_result', { job: asked.job, wait_ms: 25000 });
        if (job.state === 'done') ended = job.result;
        else waiting = job.state === 'queued' ? `Waiting behind ${count(job.ahead, 'other lane')}…` : 'Merging and checking…';
      }
      // The lane as it is now, before what came of it is said beside it.
      await changed();
      if (ended.result === 'integrated') {
        // Into another lane than the main one, or as a checkpoint of it.
        const where = ended.landed_on ? ` into ${ended.landed_on}` : ended.checkpoint ? ` as ${ended.checkpoint}` : '';
        toast(`${laneName(info.name ?? info.id)} integrated${where}`);
      } else {
        result = ended;
      }
    } catch (error) {
      // Held for its reasons (Kito 0.42): what has none is said, not what the server tells its agent.
      const left = await heldFor(lane, error);
      failed = left > 0 ? `Not integrated: ${noReason(left)}.` : error.message;
      if (left > 0) await changed();
    } finally {
      waiting = '';
    }
  }

  // How it ended, in the words of every other page. Where the lane now
  // stands is at the head of the page already: only an end that is not
  // that is said again here.
  let came = $derived(result ? outcome(result.result) : null);
  let said = $derived(came !== null && result.result !== 'awaiting_approval' && came.text !== standing(info).text);

  // It was asked for at the foot of the window, and is answered at the
  // head of the page: whoever asked is taken there.
  let place = $state(null);
  $effect(() => {
    if (result || failed) place?.scrollIntoView({ block: 'center' });
  });
</script>

<span bind:this={place}></span>
{#if waiting}
  <p class="result" role="status">{waiting}</p>
{:else if result}
  <div class="result" role="status">
    <div class="came">
      {#if said}<State said={came} />{/if}
      <p class="what">
        {#if result.result === 'verification_failed'}
          <span class="mono">{result.verification?.failed_command}</span> failed on the merged result: nothing was integrated.
        {:else if result.result === 'conflicts'}
          {count(result.conflicts.length, 'change does', 'changes do')} not compose with what {info.target ?? 'main'} has. Decide
          each in the <a href={talk}>Conversation</a>, then integrate again.
        {:else if result.result === 'out_of_scope'}
          Not integrated: it changed <span class="mono">{result.out_of_scope.join(', ')}</span>, outside its scope. Its agent
          extends its scope, or undoes the change.
        {:else if result.result === 'awaiting_approval'}
          {#if result.missing}
            Merged and checked, not integrated yet: {result.missing}.
          {:else}
            Merged and checked: it waits for somebody who may integrate.
          {/if}
        {:else if result.unexplained?.length > 0}
          Not integrated: <a href={checks}>{noReason(result.unexplained.length)}</a>.
        {:else if result.result === 'nothing_to_integrate'}
          {info.target ?? 'main'} already has everything this lane has.
        {:else}
          {result.message ?? 'Nothing was integrated.'}
        {/if}
      </p>
      <button class="quiet sm icon shut" aria-label="Close" onclick={() => (result = null)}><Icon name="close" /></button>
    </div>
    {#if result.result === 'verification_failed' && result.verification?.output}
      <pre class="output">{result.verification.output}</pre>
    {/if}
    {#if result.auto_resolutions?.length > 0}
      <p class="small soft">Settled by itself: {count(result.auto_resolutions.length, 'thing')}.</p>
    {/if}
  </div>
{/if}
<Err message={failed} />

<style>
  /* How it ended, what there is to do, and the way to put it away, on a line. */
  .came {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .what {
    flex: 1;
    min-width: 0;
  }
  /* Taller than the line it is on: it reaches past it, and the line stays as it is. */
  .shut {
    margin: -4px -4px -4px 0;
  }
  .output {
    max-height: 260px;
    white-space: pre-wrap;
  }
</style>
