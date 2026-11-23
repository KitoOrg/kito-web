<script>
  // One checkpoint, as a commit is read (Kito 0.41): why it was made, who
  // made it and from which lane, who approved it, how its checks ended;
  // the files it changed, and each one's diff with the reasons of its
  // functions. From here, the files as they were at that point. A Kito
  // that has no checkpoints of this kind shows its log instead.
  import { ask, checkpointLink, codeLink, lacked, lacks } from './api.js';
  import { count } from './format.js';
  import { checksStanding } from './standing.js';
  import CheckpointFacts from './CheckpointFacts.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import FileDiff from './FileDiff.svelte';
  import Loading from './Loading.svelte';
  import Log from './Log.svelte';
  import PageHead from './PageHead.svelte';
  import State from './State.svelte';

  // `id`: `ckpt#4`.
  let { id } = $props();

  // A checkpoint of a whole repository imported at once can change
  // thousands of files: the diffs of the first of them are asked for, the
  // others when somebody wants them.
  const SHOWN = 100;
  // Past this many files, they are listed over the diffs to go to one.
  const LISTED = 8;
  let older = $state(lacked('checkpoint_info'));
  let point = $state(null);
  let files = $state(null);
  let failed = $state('');
  let rest = $state(false);
  let all = $state(false);
  let restFailed = $state('');

  // The paths of some of the files it changed, with the names renamed ones had.
  const pathsOf = (changed) => changed.flatMap((one) => (one.from ? [one.path, one.from] : [one.path]));

  async function load() {
    try {
      point = await ask('checkpoint_info', { checkpoint: id });
      const listed = point.changed ?? [];
      const answer = await ask('diff', listed.length > SHOWN ? { to: id, paths: pathsOf(listed.slice(0, SHOWN)) } : { to: id });
      files = answer.files;
      failed = '';
    } catch (error) {
      if (point === null && lacks(error, 'checkpoint_info')) older = true;
      else failed = error.message;
    }
  }
  if (!lacked('checkpoint_info')) load();

  async function showRest() {
    rest = true;
    restFailed = '';
    try {
      const answer = await ask('diff', { to: id, paths: pathsOf(point.changed.slice(SHOWN)) });
      files = [...files, ...answer.files];
      all = true;
    } catch (error) {
      restFailed = error.message;
    } finally {
      rest = false;
    }
  }

  let changed = $derived(point?.changed ?? []);
  let unshown = $derived(files === null || all ? 0 : Math.max(0, changed.length - SHOWN));
  let reviewers = $derived((point?.reviewed_by ?? []).filter((name) => name !== point.approved_by));
  const goTo = (path) => document.getElementById(`file-${path}`)?.scrollIntoView({ block: 'start' });
</script>

{#snippet facts()}
  <span class="ref">{point.id}</span> · <CheckpointFacts {point} />
  {#if point.approved_by}· approved by {point.approved_by}{/if}
  {#if reviewers.length > 0}· reviewed by {reviewers.join(', ')}{/if}
  {#if point.git_commit}· git <span class="mono">{point.git_commit.slice(0, 10)}</span>{/if}
  {#if point.parent}· after <a class="ref" href={checkpointLink(point.parent)}>{point.parent}</a>{/if}
{/snippet}

{#snippet checks()}<State said={checksStanding(point.checks)} />{/snippet}

{#snippet browse()}<a class="button" href={codeLink('', { at: point.id, dir: true })}>Browse files</a>{/snippet}

{#if older}
  <Log />
{:else if point === null}
  <PageHead title={id} mono back={{ href: '#/history', label: 'History' }} />
  {#if failed}<Err message={failed} />{:else}<Loading lines={4} />{/if}
{:else}
  <PageHead
    title={point.why ?? point.label}
    name={point.id}
    back={{ href: '#/history', label: 'History' }}
    docs="history"
    lead={facts}
    after={point.checks ? checks : null}
    actions={browse}
  />
  <Err message={failed} />

  <div class="stack">
    {#if changed.length === 0}
      <Empty title="No file changed" />
    {:else}
      <section class="panel">
        <div class="panel-head">
          <h3>{count(changed.length, 'file')} changed</h3>
          <span class="grow"></span>
          <span class="plus">+{point.lines_added}</span>
          <span class="minus">−{point.lines_removed}</span>
        </div>
        <!-- A few files are read in their diffs; many are a list to go to one from. -->
        {#if changed.length > LISTED}
          <ul class="rows tight">
            {#each changed as one (one.path)}
              <li>
                <button class="bare row" onclick={() => goTo(one.path)}>
                  <span class="tag status">{one.status}</span>
                  <span class="path">
                    <span class="mono">{one.path}</span>
                    {#if one.from}<span class="small soft">was <span class="mono">{one.from}</span></span>{/if}
                  </span>
                  <span class="plus">+{one.lines_added}</span>
                  <span class="minus">−{one.lines_removed}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      {#if files === null}
        {#if !failed}<Loading lines={6} />{/if}
      {:else}
        {#each files as file (file.path)}
          <FileDiff lane={null} at={point.id} {file} threads={[]} changed={load} mayWrite={false} viewing={false} />
        {/each}
        {#if unshown > 0}
          <div>
            <button disabled={rest} onclick={showRest}>{rest ? 'Loading…' : `Show ${count(unshown, 'more file')}`}</button>
          </div>
          <Err message={restFailed} />
        {/if}
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* What happened to a file, in a column of its own: the paths start in one line. */
  .status {
    min-width: 64px;
  }
  .path {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    align-items: baseline;
    overflow-wrap: anywhere;
  }
</style>
