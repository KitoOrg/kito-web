<script>
  // What was said about a lane, in the order it was said: the lane
  // opened, the comments and their answers, the verdicts; then what is
  // left to decide.
  import { laneLink } from './api.js';
  import { who } from './format.js';
  import { verdictStanding } from './standing.js';
  import Conflicts from './Conflicts.svelte';
  import Face from './Face.svelte';
  import State from './State.svelte';
  import Thread from './Thread.svelte';
  import Time from './Time.svelte';

  // `title`: what the page is headed with. An intent that is not it is
  // said where the lane was opened.
  let { lane, info, title = '', seen = null, threads, verdicts, conflicts, target = 'main', resolved = $bindable(false), changed, mayWrite = true } = $props();

  let events = $derived(
    [
      ...threads.map((thread) => ({ kind: 'thread', at: thread.comment.at_ms ?? 0, key: thread.comment.id, thread })),
      ...verdicts.map((verdict) => ({ kind: 'verdict', at: verdict.at_ms ?? 0, key: `${verdict.by} ${verdict.at_ms}`, verdict })),
    ].sort((a, b) => a.at - b.at),
  );

  // When the lane said what it would change first: when it was opened.
  let opened = $derived(Math.min(...(seen?.scope ?? []).map((item) => item.at_ms).filter((at) => at > 0)));
</script>

<ol class="timeline">
  <li class="ev">
    <Face name={info.agent} agent assistant={info.assistant} />
    <div class="body opened">
      <p>
        <b>{who(info.agent, info.owner)}</b> opened this lane
        {#if Number.isFinite(opened)}<span class="small faint">· <Time ms={opened} /></span>{/if}
      </p>
      {#if info.intent && info.intent !== title}<p><q class="reason">{info.intent}</q></p>{/if}
    </div>
  </li>
  {#each events as event (event.key)}
    {#if event.kind === 'thread'}
      {@const said = event.thread.comment}
      <li class="ev">
        <Face name={said.by} agent={Boolean(said.for)} assistant={said.by === info.agent ? info.assistant : null} />
        <div class="body">
          {#if said.on}
            <p class="small soft">
              On <a class="ref" href={`${laneLink(lane)}?tab=changes&at=${encodeURIComponent(event.thread.file ?? '')}`}>{said.on}</a>
            </p>
          {/if}
          <Thread {lane} comment={said} answers={event.thread.answers} {changed} {mayWrite} quote />
        </div>
      </li>
    {:else}
      {@const verdict = event.verdict}
      {@const stands = verdictStanding(verdict.verdict)}
      <li class="ev">
        <span class={['ring', stands.tone, 'mark']} aria-hidden="true"></span>
        <div class="body">
          <p>
            <b>{who(verdict.by, verdict.for)}</b>
            <State said={stands} plain />
            {#if verdict.at_ms}<span class="small faint">· <Time ms={verdict.at_ms} /></span>{/if}
            {#if verdict.because}<span class="small faint">· does not count: {verdict.because}</span>{/if}
          </p>
          {#if verdict.text}<p class="said">{verdict.text}</p>{/if}
        </div>
      </li>
    {/if}
  {/each}
</ol>

<label class="check shown">
  <input type="checkbox" bind:checked={resolved} /> Show resolved comments
</label>

{#if conflicts.length > 0}
  <Conflicts {conflicts} {target} {changed} {mayWrite} />
{/if}

<style>
  .timeline {
    position: relative;
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The line everything said hangs on. */
  .timeline::before {
    content: '';
    position: absolute;
    left: 12px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: var(--line);
  }
  .ev {
    position: relative;
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  /* Beside a face: its one line stands at the middle of it. */
  .opened {
    padding-top: 4px;
  }
  /* A verdict, on the line: its tone, and nothing of the line through it. */
  .mark {
    justify-self: center;
    background: var(--bg);
  }
  /* Pressed on its words, not across the page. */
  .shown {
    justify-self: start;
  }
</style>
