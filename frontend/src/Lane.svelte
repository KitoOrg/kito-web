<script>
  // A lane: what it is for, what it changes, what was said, where its
  // review stands.
  import { ask, watch } from './api.js';
  import Assistant from './Assistant.svelte';
  import Conflicts from './Conflicts.svelte';
  import FileDiff from './FileDiff.svelte';
  import Integrate from './Integrate.svelte';
  import Review from './Review.svelte';
  import State from './State.svelte';
  import Thread from './Thread.svelte';

  let { lane } = $props();

  let info = $state(null);
  let diff = $state(null);
  let review = $state(null);
  let comments = $state([]);
  let resolved = $state(false);
  let failed = $state('');

  let text = $state('');
  let busy = $state(false);
  let commentFailed = $state('');

  async function load() {
    try {
      // The diff first: it records what was saved in the lane a moment ago.
      const changes = await ask('lane_diff', { lane });
      const [status, said, stands] = await Promise.all([
        ask('lane_status', { lane }),
        ask('comments', { lane, all: resolved }),
        ask('review', { lane }),
      ]);
      [diff, info, comments, review, failed] = [changes, status, said, stands, ''];
    } catch (error) {
      failed = error.message;
    }
  }

  $effect(() => {
    resolved;
    load();
  });

  $effect(() => {
    // Told when something happens to this lane, or lands under it.
    let pending = null;
    const stop = watch((events) => {
      const id = info?.id;
      if (!events.some((event) => !event.lane || event.lane === id || event.kind === 'integrated')) return;
      clearTimeout(pending);
      pending = setTimeout(load, 150);
    });
    return () => {
      stop();
      clearTimeout(pending);
    };
  });

  // Each comment that started an exchange, with its answers.
  let threads = $derived(
    comments
      .filter((comment) => !comment.reply_to)
      .map((comment) => ({ comment, answers: comments.filter((answer) => answer.reply_to === comment.id) })),
  );

  // The file a comment is on, among those the lane changed.
  function fileOf(comment) {
    if (!comment.on) return null;
    const paths = diff?.files.map((file) => file.path) ?? [];
    if (paths.includes(comment.on)) return comment.on;
    const lines = comment.on.replace(/:\d+(-\d+)?$/, '');
    if (paths.includes(lines)) return lines;
    return paths.find((path) => comment.on.startsWith(`${path}:`)) ?? null;
  }

  let placed = $derived(threads.map((thread) => ({ ...thread, file: fileOf(thread.comment) })));
  let about = $derived(placed.filter((thread) => thread.file === null));
  const inFile = (path) => placed.filter((thread) => thread.file === path);

  async function comment() {
    busy = true;
    commentFailed = '';
    try {
      await ask('comment', { lane, text });
      text = '';
      await load();
    } catch (error) {
      commentFailed = error.message;
    } finally {
      busy = false;
    }
  }

  // The conflicts no integration has applied a decision to yet.
  let conflicts = $derived((info?.conflicts ?? []).filter((conflict) => typeof conflict === 'object' && !conflict.resolved));

  let totals = $derived(
    (diff?.files ?? []).reduce((sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }), {
      added: 0,
      removed: 0,
    }),
  );
</script>

<p class="back"><a href="#/">← Lanes</a></p>

{#if failed && info === null}
  <p class="error">{failed}</p>
{:else if info === null}
  <p class="soft">…</p>
{:else}
  <div class="top">
    <div class="title">
      <h1>{info.task ?? info.intent ?? 'no intent said'}</h1>
      <p class="soft meta">
        <span class="mono">{info.name ?? info.id}</span>
        · {info.agent}{#if info.owner && info.owner !== info.agent}, for {info.owner}{/if}
        {#if info.assistant?.name}· <Assistant assistant={info.assistant} words />{/if}
        · onto {diff.onto}, from {diff.base}
      </p>
    </div>
    <State lane={info} />
  </div>

  {#if failed}<p class="error">{failed}</p>{/if}

  {#if diff.behind > 0}
    <p class="notice">
      {diff.onto} changed {diff.behind}
      {diff.behind === 1 ? 'file' : 'files'} since this lane started: it has not seen {diff.behind === 1 ? 'it' : 'them'}.
    </p>
  {/if}
  {#if info.out_of_scope?.length > 0}
    <p class="notice">Changed outside what it declared: <span class="mono">{info.out_of_scope.join(', ')}</span></p>
  {/if}

  <div class="columns">
    <div class="main">
      {#if conflicts.length > 0}
        <Conflicts {conflicts} target={diff.onto} changed={load} />
      {/if}
      <p class="summary soft">
        {diff.files.length}
        {diff.files.length === 1 ? 'file' : 'files'} changed,
        <span class="plus">+{totals.added}</span> <span class="minus">−{totals.removed}</span>
        {#if info.scope?.length > 0}· declared: <span class="mono">{info.scope.join(', ')}</span>{/if}
      </p>

      {#if diff.files.length === 0}
        <div class="panel empty soft">This lane has changed nothing yet.</div>
      {/if}
      {#each diff.files as file (file.path)}
        <FileDiff {lane} {file} threads={inFile(file.path)} changed={load} />
      {/each}
    </div>

    <aside>
      <Review {lane} {review} changed={load} />
      <Integrate {lane} {info} changed={load} />

      <section class="panel said" aria-label="Comments on the lane">
        <h2>On the lane</h2>
        {#each about as thread (thread.comment.id)}
          {#if thread.comment.on}<p class="about soft">On <span class="mono">{thread.comment.on}</span></p>{/if}
          <Thread {lane} comment={thread.comment} answers={thread.answers} changed={load} />
        {/each}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            comment();
          }}
        >
          <textarea
            bind:value={text}
            placeholder="Say something about the lane as a whole. Its agent is told before its next edit."
            aria-label="Comment on the lane"
          ></textarea>
          <div class="actions">
            <button class="primary" disabled={busy || text.trim().length < 2}>Comment</button>
          </div>
          {#if commentFailed}<p class="error">{commentFailed}</p>{/if}
        </form>
        <label class="soft toggle">
          <input type="checkbox" bind:checked={resolved} /> Show resolved comments
        </label>
      </section>
    </aside>
  </div>
{/if}

<style>
  .back {
    margin: 0 0 12px;
    font-size: 14px;
  }
  .top {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 16px;
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  h1 {
    overflow-wrap: anywhere;
  }
  .meta {
    margin: 4px 0 0;
    font-size: 14px;
  }
  .notice {
    margin: 0 0 12px;
    padding: 8px 14px;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn);
    font-size: 14px;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
    aside {
      order: -1;
    }
  }
  .main {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .summary {
    margin: 0;
    font-size: 14px;
  }
  .plus {
    color: var(--added-ink);
    font-family: var(--mono);
  }
  .minus {
    color: var(--removed-ink);
    font-family: var(--mono);
  }
  .empty {
    padding: 20px;
  }
  aside {
    display: grid;
    gap: 14px;
  }
  .said {
    padding: 14px 16px;
    display: grid;
    gap: 8px;
  }
  .about {
    margin: 4px 0 -2px;
    font-size: 13px;
  }
  form {
    margin-top: 4px;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .toggle {
    font-size: 13px;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .error {
    margin: 0 0 12px;
  }
</style>
