<script>
  // Bringing a lane in: asked for, waited for, and how it ended. Closing
  // the lane is here too.
  import { ask } from './api.js';

  let { lane, info, changed } = $props();

  let state = $state('idle'); // idle | waiting | done
  let waiting = $state('');
  let result = $state(null);
  let failed = $state('');
  let closing = $state(false);
  let busy = $state(false);

  export async function integrate() {
    state = 'waiting';
    waiting = 'asked';
    failed = '';
    result = null;
    try {
      const asked = await ask('request_integration', { lane });
      // The answer waits for the result; a long check is asked about again.
      for (;;) {
        const job = await ask('integration_result', { job: asked.job, wait_ms: 25000 });
        if (job.state === 'done') {
          result = job.result;
          break;
        }
        waiting = job.state === 'queued' ? `waiting behind ${job.ahead} other ${job.ahead === 1 ? 'lane' : 'lanes'}` : 'merging and checking';
      }
      state = 'done';
      await changed();
    } catch (error) {
      failed = error.message;
      state = 'idle';
    }
  }

  async function close() {
    busy = true;
    failed = '';
    try {
      await ask('close_lane', { lane });
      location.hash = '#/';
    } catch (error) {
      failed = error.message;
      busy = false;
      closing = false;
    }
  }

  const tone = { integrated: 'ok', nothing_to_integrate: '', awaiting_approval: 'warn' };
  const title = {
    integrated: 'Integrated',
    nothing_to_integrate: 'Nothing to integrate',
    conflicts: 'Conflicts to decide',
    verification_failed: 'The checks failed',
    out_of_scope: 'Changes outside its scope',
    awaiting_approval: 'It waits',
    failed: 'It could not be integrated',
  };
</script>

<section class="panel" aria-label="Integration">
  <h2>Integration</h2>
  {#if state === 'waiting'}
    <p class="soft small" role="status">Asked to integrate: {waiting}…</p>
  {:else}
    <p class="soft small">
      Merges the lane with {info.target ?? 'main'}, runs the checks, and brings it in if nothing is missing.
    </p>
  {/if}
  <div class="actions">
    <button class="primary" disabled={state === 'waiting' || busy} onclick={integrate}>Integrate</button>
    {#if closing}
      <button disabled={busy} onclick={close}>Yes, close {info.name ?? info.id}</button>
      <button class="quiet" onclick={() => (closing = false)}>Keep it</button>
    {:else if !info.name}
      <button class="quiet" disabled={state === 'waiting'} onclick={() => (closing = true)}>Close the lane</button>
    {/if}
  </div>
  {#if closing}
    <p class="soft small">Closing records its last changes and removes its working copy. What was not integrated stays in the lane's history.</p>
  {/if}

  {#if result}
    <div class="result">
      <p><span class={`chip ${tone[result.result] ?? 'bad'}`}>{title[result.result] ?? result.result}</span></p>
      {#if result.result === 'integrated'}
        <p class="small">
          {#if result.landed_on}On {result.landed_on}: it reaches the main lane with it.{:else}As {result.checkpoint}{#if result.git_commit}, git <span class="mono">{result.git_commit.slice(0, 10)}</span>{/if}.{/if}
          {#if result.verification?.commands?.length > 0}
            Checked: <span class="mono">{result.verification.commands.join('; ')}</span>
          {/if}
        </p>
      {:else if result.result === 'verification_failed'}
        <p class="small">
          <span class="mono">{result.verification?.failed_command}</span> failed on the merged result: nothing was integrated.
        </p>
        {#if result.verification?.output}<pre>{result.verification.output}</pre>{/if}
      {:else if result.result === 'conflicts'}
        <p class="small">
          {result.conflicts.length}
          {result.conflicts.length === 1 ? 'change does' : 'changes do'} not compose with what {info.target ?? 'main'} has. Decide
          each below, then integrate again.
        </p>
      {:else if result.result === 'out_of_scope'}
        <p class="small">It changed what it did not declare: <span class="mono">{result.out_of_scope.join(', ')}</span></p>
        <p class="soft small">Its agent extends its scope, or undoes the change.</p>
      {:else if result.result === 'awaiting_approval'}
        <p class="small">{result.missing ?? 'Merged and checked: it waits for somebody who may integrate.'}</p>
      {:else if result.message}
        <p class="small">{result.message}</p>
      {/if}
      {#if result.auto_resolutions?.length > 0}
        <p class="soft small">Settled by itself: {result.auto_resolutions.length} {result.auto_resolutions.length === 1 ? 'thing' : 'things'}.</p>
      {/if}
    </div>
  {/if}
  {#if failed}<p class="error">{failed}</p>{/if}
</section>

<style>
  section {
    padding: 14px 16px;
  }
  h2 {
    margin-bottom: 4px;
  }
  .small {
    margin: 4px 0 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .result {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .result p {
    margin: 0 0 4px;
  }
  pre {
    margin: 6px 0 0;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--bg);
    font: 12px/1.5 var(--mono);
    overflow-x: auto;
    max-height: 260px;
    white-space: pre-wrap;
  }
  .error {
    margin: 10px 0 0;
  }
</style>
