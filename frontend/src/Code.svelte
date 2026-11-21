<script>
  // Where to ask why: the files of the main lane, and earlier work found
  // by the words of its reason.
  import { ask, ago, laneLink, whyLink } from './api.js';

  let files = $state(null);
  let failed = $state('');
  let words = $state('');
  let found = $state(null);
  let searching = $state(false);

  ask('lane_files')
    .then((listed) => (files = listed.files.map((file) => file.path)))
    .catch((error) => (failed = error.message));

  async function search() {
    searching = true;
    try {
      found = await ask('reasons', { about: words, limit: 30 });
      failed = '';
    } catch (error) {
      failed = error.message;
    } finally {
      searching = false;
    }
  }

  // Files under the directory each is in.
  let folders = $derived.by(() => {
    const folders = new Map();
    for (const path of files ?? []) {
      const at = path.lastIndexOf('/');
      const folder = at < 0 ? '' : path.slice(0, at + 1);
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(path);
    }
    return [...folders.entries()].sort(([a], [b]) => a.localeCompare(b));
  });
</script>

<h1>Why</h1>
<p class="soft lead">Why code is the way it is: the reasons people and agents gave when they changed it.</p>

<form
  class="search"
  onsubmit={(event) => {
    event.preventDefault();
    search();
  }}
>
  <input bind:value={words} placeholder="Find earlier work by the words of its reason: cents, task #7, alice cache" aria-label="Words of a reason" />
  <button class="primary" disabled={searching}>Find</button>
</form>

{#if failed}<p class="error">{failed}</p>{/if}

{#if found !== null}
  <section class="panel found">
    <h2>{found.length === 0 ? 'No reason has those words' : `${found.length} ${found.length === 1 ? 'reason' : 'reasons'}`}</h2>
    {#each found as hit}
      <article>
        <p class="why">“{hit.why}”</p>
        <p class="soft meta">
          {hit.by.join(', ')}{#if hit.for}, for {hit.for}{/if}
          {#if hit.lane}· <a href={laneLink(hit.lane)}>{hit.lane}</a>{/if}
          {#if hit.checkpoint}· {hit.checkpoint}{/if}
          · {ago(hit.at_ms)}
        </p>
        <p class="changed">
          {#each hit.changed as target}
            <a class="mono" href={whyLink(target)}>{target}</a>
          {/each}
          {#if hit.changed_more}<span class="faint">and {hit.changed_more} more</span>{/if}
        </p>
      </article>
    {/each}
  </section>
{/if}

<h2 class="files">Files of the main lane</h2>
{#if files === null && !failed}
  <p class="soft">…</p>
{:else if files?.length === 0}
  <p class="soft">The main lane has no file yet.</p>
{:else}
  <div class="panel tree">
    {#each folders as [folder, paths]}
      <div class="folder">
        <span class="mono faint">{folder || './'}</span>
        <ul>
          {#each paths as path}
            <li><a class="mono" href={whyLink(path)}>{path.slice(folder.length)}</a></li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/if}

<style>
  .lead {
    margin: 4px 0 16px;
  }
  .search {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  input {
    flex: 1;
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .found {
    padding: 14px 16px;
    margin-bottom: 20px;
  }
  article {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .why {
    margin: 0;
    font-weight: 600;
  }
  .meta {
    margin: 2px 0 0;
    font-size: 13px;
  }
  .changed {
    margin: 6px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .files {
    margin: 8px 0 10px;
  }
  .tree {
    padding: 12px 16px;
    display: grid;
    gap: 10px;
  }
  ul {
    list-style: none;
    margin: 2px 0 0;
    padding: 0 0 0 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 18px;
  }
</style>
