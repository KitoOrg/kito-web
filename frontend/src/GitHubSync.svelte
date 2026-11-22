<script>
  // A repository linked to one at GitHub (kito-github 0.4, on Kito 0.39):
  // which one, the branch the main lane is, code and issues on or off, how
  // the last sync went, and Sync now. One of the settings of a repository:
  // it is laid out as they are. The plugin answers under /github: what it
  // keeps is its own.
  import { laneLink } from './api.js';
  import { humanize } from './format.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import SettingCard from './SettingCard.svelte';
  import Time from './Time.svelte';

  let { repo, admin = false } = $props();

  let now = $state(null);
  // The repositories the server's app reaches at GitHub: null until asked for.
  let choices = $state(null);
  let choicesFailed = $state('');
  // Why the card could not be shown, and why what was pressed did not work.
  let failed = $state('');
  let wrong = $state('');
  // What is being done: `link`, `save`, `sync` or `unlink`.
  let busy = $state('');

  // What is being chosen.
  let github = $state('');
  let branch = $state('main');
  let code = $state(true);
  let issues = $state(true);

  async function call(what, body) {
    const response = await fetch(`/github/api/${encodeURIComponent(repo)}/${what}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const said = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(said.error ?? `the GitHub plugin answered ${response.status}`);
    return said;
  }

  async function load() {
    try {
      now = await call('status');
      const link = now.link;
      if (link) {
        github = link.github;
        branch = link.branch || 'main';
        code = link.code;
        issues = link.issues;
      }
      failed = '';
      if (now.app && now.may_change && choices === null) {
        call('choices')
          .then((found) => (choices = found.repositories ?? []))
          .catch((error) => {
            choices = [];
            choicesFailed = error.message;
          });
      }
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function act(doing, what, body, saying) {
    busy = doing;
    wrong = '';
    try {
      await call(what, body);
      toast(saying);
      await load();
    } catch (error) {
      wrong = error.message;
    } finally {
      busy = '';
    }
  }

  const chosen = () => ({ github, branch: branch.trim() || 'main', code, issues });
  const link = () => act('link', 'link', chosen(), `Linked to ${github}`);
  const save = () => act('save', 'link', chosen(), github === now.link.github ? 'GitHub link saved' : `Linked to ${github}`);
  const unlink = () => act('unlink', 'unlink', {}, `Unlinked from ${now.link.github}`);
  const syncNow = () => act('sync', 'sync', {}, 'Synced with GitHub');

  // The branch GitHub calls default, when a repository is picked.
  function picked(name) {
    github = name;
    const one = choices?.find((choice) => choice.name === name);
    if (one?.branch) branch = one.branch;
  }

  let changed = $derived(
    Boolean(now?.link) &&
      (github !== now.link.github || branch !== (now.link.branch || 'main') || code !== now.link.code || issues !== now.link.issues),
  );
</script>

<SettingCard title="GitHub" about="Code both ways, issues as tasks.">
  {#snippet state()}
    {#if now?.link?.last_error}
      <span class="chip bad">sync failed</span>
    {:else if now?.link}
      <span class="chip ok">linked</span>
    {/if}
  {/snippet}

  {#if now === null && !failed}
    <div class="stretch"><Loading lines={2} /></div>
  {:else if now && !now.app}
    {#if admin}
      <p>The server has no GitHub App yet: it is created on the <a href={`${location.pathname}#/admin`}>Plugins</a> page.</p>
    {:else}
      <p>The server has no GitHub App yet. An admin creates it on the Plugins page.</p>
    {/if}
  {:else if now}
    {#if now.link}
      <p>
        Linked to
        <a href={`https://github.com/${now.link.github}`} target="_blank" rel="noreferrer">{now.link.github} <Icon name="external" /></a>.
        The main lane is the branch <span class="mono">{now.link.branch || 'main'}</span>.
        {#if now.permanent?.length > 0}
          Permanent lanes are pushed as branches of the same name:
          {#each now.permanent as lane, i}{i > 0 ? ', ' : ''}<a class="ref" href={laneLink(lane)}>{lane}</a>{/each}.
        {/if}
      </p>
      <p class="soft">
        {#if now.link.last_ms}Last synced <Time ms={now.link.last_ms} />{:else}Not synced yet{/if}
      </p>
      <Err message={humanize(now.link.last_error)} />
      {#if now.link.said?.length > 0}
        <div class="small faint">
          {#each now.link.said as line}<p>{humanize(line)}</p>{/each}
        </div>
      {/if}
    {:else}
      <p>Not linked to a repository at GitHub yet.</p>
    {/if}

    {#if now.may_change}
      <div class="fields">
        <label class="field">
          <span>Repository at GitHub</span>
          {#if choices?.length > 0}
            <select value={github} onchange={(event) => picked(event.currentTarget.value)}>
              <option value="" disabled>Choose one</option>
              {#each choices as choice}<option value={choice.name}>{choice.name}{choice.private ? ' (private)' : ''}</option>{/each}
              {#if github && !choices.some((choice) => choice.name === github)}<option value={github}>{github}</option>{/if}
            </select>
          {:else}
            <input placeholder="acme/shop" bind:value={github} />
          {/if}
        </label>
        <label class="field">
          <span>Branch of the main lane</span>
          <input class="mono" placeholder="main" bind:value={branch} />
        </label>
      </div>
      <Err message={choicesFailed} />
      <p class="hint">
        <a href={now.app.install} target="_blank" rel="noreferrer">Install the app on more repositories <Icon name="external" /></a>
      </p>
      <label class="check"><input type="checkbox" bind:checked={code} /> Code, both ways</label>
      <label class="check"><input type="checkbox" bind:checked={issues} /> Issues as tasks</label>
      <div class="controls">
        {#if now.link}
          <button class="primary" disabled={busy !== '' || !changed || !github.includes('/')} onclick={save}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button disabled={busy !== ''} onclick={syncNow}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
          <span class="grow"></span>
          <Confirm
            label="Unlink"
            ask={`Unlink this repository from ${now.link.github}? Its code and its issues stop syncing with GitHub.`}
            working="Unlinking…"
            disabled={busy !== ''}
            onyes={unlink}
          />
        {:else}
          <button class="primary" disabled={busy !== '' || !github.includes('/')} onclick={link}>
            {busy === 'link' ? 'Linking…' : 'Link'}
          </button>
        {/if}
      </div>
      <Err message={wrong} />
    {:else}
      <p class="hint">Only maintainers change it.</p>
    {/if}
  {/if}
  <Err message={failed} />
</SettingCard>
