<script>
  // The server's backups (Kito 0.35), for its admins: the schedule, the
  // archives here and in S3, one made now, one downloaded.
  import { people } from './api.js';

  let said = $state(null);
  let failed = $state('');
  let busy = $state(false);
  let made = $state(null);

  async function load() {
    try {
      said = await people('server.backups');
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function now() {
    busy = true;
    failed = '';
    try {
      made = await people('server.backup_now');
    } catch (error) {
      failed = error.message;
    }
    busy = false;
    await load();
  }

  const size = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  };
  // `kito-backup-2026-11-22T031500Z.kbak`: when it was made.
  const when = (name) => {
    const found = name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z/);
    return found ? new Date(`${found[1]}T${found[2]}:${found[3]}:${found[4]}Z`).toLocaleString() : name;
  };
</script>

<div class="top">
  <h1>Backups</h1>
  <span class="grow"></span>
  <button class="primary" disabled={busy} onclick={now}>{busy ? 'Making one…' : 'Back up now'}</button>
</div>
<p class="soft">
  The whole server in one archive: every repository, the people, the settings. Compressed and encrypted with the
  server's backup key, which <code>kito-server backup key</code> prints on its machine: a restore needs it.
</p>
{#if failed}<p class="error" role="alert">{failed}</p>{/if}
{#if made}<p class="chip ok" role="status">{made.name}: {made.files} files, {size(made.size)}</p>{/if}

{#if said === null && !failed}
  <p class="soft">…</p>
{:else if said}
  <div class="panel facts">
    <div><span class="soft">When</span> {said.every_hours ? `every ${said.every_hours} hours, while the server serves` : 'only when asked'}</div>
    <div><span class="soft">Kept</span> the last {said.keep}</div>
    <div><span class="soft">Here</span> <span class="mono">{said.folder ?? 'nowhere: only in S3'}</span></div>
    <div><span class="soft">S3</span> <span class="mono">{said.s3 ?? 'not set up'}</span></div>
  </div>
  <table class="list">
    <thead><tr><th>Made</th><th>Archive</th><th>Size</th><th>Kept</th><th></th></tr></thead>
    <tbody>
      {#each said.backups as one}
        <tr>
          <td>{when(one.name)}</td>
          <td class="mono">{one.name}</td>
          <td>{size(one.size)}</td>
          <td>{one.kept.join(', ')}</td>
          <td>{#if one.kept.includes('here')}<a href={`/-/admin/backups/${encodeURIComponent(one.name)}`} download>Download</a>{/if}</td>
        </tr>
      {:else}
        <tr><td colspan="5" class="soft">None yet.</td></tr>
      {/each}
    </tbody>
  </table>
  <p class="faint">
    To put one back: <code>kito-server restore &lt;archive&gt; --to &lt;empty directory&gt; --key &lt;key file&gt;</code>,
    then serve from there.
  </p>
{/if}

<style>
  .top {
    display: flex;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
    padding: 12px 16px;
    margin: 12px 0;
  }
  .facts .soft {
    display: block;
    font-size: 12px;
  }
  .list {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .list th {
    text-align: left;
    color: var(--soft);
    font-weight: 600;
    font-size: 12px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .list td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
</style>
