<script>
  // The server's backups (Kito 0.35), for its admins: the schedule, the
  // archives here and in S3, one made now, one downloaded.
  import { people } from './api.js';
  import { count, size } from './format.js';
  import { toast } from './toast.svelte.js';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  let said = $state(null);
  let failed = $state('');
  let busy = $state(false);

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
      const made = await people('server.backup_now');
      toast(`Backed up: ${count(made.files, 'file')}, ${size(made.size)}`);
    } catch (error) {
      failed = error.message;
    }
    busy = false;
    await load();
  }

  // `kito-backup-2026-11-22T031500Z.kbak`: when it was made, in milliseconds since 1970; 0 when its name does not say.
  const madeAt = (name) => {
    const found = name.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
    if (!found) return 0;
    const [year, month, date, hours, minutes, seconds] = found.slice(1).map(Number);
    return Date.UTC(year, month - 1, date, hours, minutes, seconds);
  };

  // How often one is made on its own.
  const every = (hours) => (hours === 1 ? 'Every hour' : `Every ${count(hours, 'hour')}`);
  // Where an archive is kept: in the server's folder (`here`), in S3, or both.
  const where = (kept) => {
    const [here, s3] = [kept.includes('here'), kept.includes('s3')];
    return here && s3 ? 'In the folder and in S3' : s3 ? 'In S3' : 'In the folder';
  };
</script>

<PageHead title="Backups" docs="backups">
  {#snippet actions()}
    <button class="primary" disabled={busy} onclick={now}>{busy ? 'Backing up…' : 'Back up now'}</button>
  {/snippet}
</PageHead>

<Err message={failed} />

{#if said === null && !failed}
  <Loading />
{:else if said}
  <dl class="panel pad kv">
    <dt>Schedule</dt>
    <dd>{said.every_hours ? `${every(said.every_hours)}, while the server serves` : 'Only when asked'}</dd>
    <dt>Kept</dt>
    <dd>The last {count(said.keep, 'archive')}</dd>
    <dt>Folder</dt>
    <dd>
      {#if said.folder}<span class="mono">{said.folder}</span>{:else}<span class="none">None</span>{/if}
    </dd>
    <dt>S3</dt>
    <dd>
      {#if said.s3}<span class="mono">{said.s3}</span>{:else}<span class="none">None</span>{/if}
    </dd>
  </dl>

  <h2 class="section-title">Archives</h2>
  <div class="panel table-wrap">
    <table>
      <thead>
        <tr><th>Made</th><th>Archive</th><th>Size</th><th>Where</th><th class="actions"><span class="sr">Actions</span></th></tr>
      </thead>
      <tbody>
        {#each said.backups as one (one.name)}
          <tr>
            <td><Time ms={madeAt(one.name)} never="unknown" /></td>
            <td class="mono">{one.name}</td>
            <td>{size(one.size)}</td>
            <td>{where(one.kept)}</td>
            <td class="actions">
              {#if one.kept.includes('here')}
                <a class="button sm quiet" href={`/-/admin/backups/${encodeURIComponent(one.name)}`} download>Download</a>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5"><Empty inset title="No backups yet" /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
