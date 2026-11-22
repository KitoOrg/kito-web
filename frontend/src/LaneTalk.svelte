<script>
  // What was said about a lane, in the order it was said: the lane
  // opened, the comments and their answers, the verdicts; then what is
  // left to decide, and a place to say something.
  import { ago, laneLink } from './api.js';
  import Conflicts from './Conflicts.svelte';
  import Face from './Face.svelte';
  import Thread from './Thread.svelte';

  let {
    lane,
    info,
    seen = null,
    threads,
    verdicts,
    conflicts,
    target = 'main',
    role = undefined,
    user = null,
    resolved = $bindable(false),
    changed,
  } = $props();

  let events = $derived(
    [
      ...threads.map((thread) => ({ kind: 'thread', at: thread.comment.at_ms ?? 0, key: thread.comment.id, thread })),
      ...verdicts.map((verdict) => ({ kind: 'verdict', at: verdict.at_ms ?? 0, key: `${verdict.by} ${verdict.at_ms}`, verdict })),
    ].sort((a, b) => a.at - b.at),
  );

  // When the lane said what it would change first: when it was opened.
  let opened = $derived(Math.min(...(seen?.scope ?? []).map((item) => item.at_ms).filter((at) => at > 0)));

  const who = (said) => (said.for ? `${said.by}, of ${said.for}` : said.by);
  const tone = { approved: 'ok', changes_requested: 'bad' };
</script>

<ol class="timeline">
  <li class="ev">
    <Face name={info.agent} agent assistant={info.assistant} />
    <div class="panel card">
      <p class="who">
        <b>{info.agent}</b> opened this lane{#if info.owner && info.owner !== info.agent}&nbsp;for {info.owner}{/if}
        {#if Number.isFinite(opened)}<span class="faint">· {ago(opened)}</span>{/if}
      </p>
      <p class="text">{info.intent ?? 'No intent was said.'}</p>
      {#if info.task}<p class="soft small">Task: {info.task}</p>{/if}
      {#if info.scope?.length > 0}
        <p class="soft small">
          Declared: {#each info.scope as item, i}<span class="mono">{item}</span>{#if i < info.scope.length - 1},&nbsp;{/if}{/each}
        </p>
      {/if}
    </div>
  </li>
  {#each events as event (event.key)}
    {#if event.kind === 'thread'}
      {@const said = event.thread.comment}
      <li class="ev">
        <Face name={said.by} agent={Boolean(said.for)} assistant={said.by === info.agent ? info.assistant : null} />
        <div class="body">
          {#if said.on}
            <p class="on soft">
              On <a class="mono" href={`${laneLink(lane)}?tab=changes&at=${encodeURIComponent(event.thread.file ?? '')}`}>{said.on}</a>
            </p>
          {/if}
          {#if said.quoted && !said.outdated}<pre class="quoted">{said.quoted}</pre>{/if}
          <Thread {lane} comment={said} answers={event.thread.answers} {changed} />
        </div>
      </li>
    {:else}
      {@const verdict = event.verdict}
      <li class="ev small">
        <span class="dot" aria-hidden="true"></span>
        <p>
          <span class={`chip ${tone[verdict.verdict] ?? ''}`}>{verdict.verdict.replaceAll('_', ' ')}</span>
          by {who(verdict)}
          {#if verdict.at_ms}<span class="faint">· {ago(verdict.at_ms)}</span>{/if}
          {#if verdict.text}<span class="soft">: {verdict.text}</span>{/if}
          {#if verdict.because}<span class="faint"> (does not count: {verdict.because})</span>{/if}
        </p>
      </li>
    {/if}
  {/each}
</ol>

{#if conflicts.length > 0}
  <Conflicts {conflicts} {target} {changed} />
{/if}


<label class="soft toggle">
  <input type="checkbox" bind:checked={resolved} /> Show resolved comments
</label>

<style>
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    position: relative;
    display: grid;
    gap: 14px;
  }
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
    gap: 10px;
    align-items: start;
  }
  .ev.small {
    font-size: 13px;
    align-items: center;
  }
  .ev.small p {
    margin: 0;
  }
  .dot {
    justify-self: center;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--line);
    border: 2px solid var(--bg);
    box-sizing: content-box;
  }
  .card {
    padding: 10px 14px;
  }
  .who {
    margin: 0 0 4px;
    font-size: 13px;
    color: var(--soft);
  }
  .who b {
    color: var(--ink);
  }
  .text {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .small {
    margin: 6px 0 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .body {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .on {
    margin: 0;
    font-size: 13px;
  }
  .quoted {
    margin: 0;
    padding: 6px 10px;
    border-left: 3px solid var(--line);
    background: var(--panel);
    color: var(--soft);
    font: 12px/1.5 var(--mono);
    overflow-x: auto;
  }
  .toggle {
    font-size: 13px;
    display: flex;
    gap: 6px;
    align-items: center;
  }
</style>
