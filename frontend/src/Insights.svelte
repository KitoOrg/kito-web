<script>
  // The numbers of a repository (Kito 0.34): how lanes flow, each
  // assistant and model, where the code is busy, how review goes. Behind
  // a server with no repository chosen, every repository side by side.
  import { askIn } from './api.js';
  import {
    BarController,
    BarElement,
    CategoryScale,
    Chart,
    Legend,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
  } from 'chart.js';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Legend, Tooltip);

  let { repo = null, repos = [], team = false } = $props();

  const spans = [
    [28, 'last 4 weeks'],
    [90, 'last 3 months'],
    [365, 'last year'],
    ['', 'all'],
  ];
  let days = $state(90);
  let all = $state(null);
  let failed = $state('');

  async function load() {
    const params = days ? { since_ms: Date.now() - Number(days) * 86400000 } : {};
    const names = repo || !team ? [team ? repo : null] : repos.map((one) => one.name);
    try {
      all = await Promise.all(names.map(async (name) => ({ name, stats: await askIn(name, 'stats', params) })));
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  $effect(() => {
    days;
    load();
  });

  const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const palette = () => ({
    accent: css('--accent', '#4a41c4'),
    ok: css('--ok', '#1c6b2a'),
    warn: css('--warn', '#8a5a00'),
    bad: css('--bad', '#9b2a20'),
    ink: css('--soft', '#5d5c6b'),
    line: css('--line', '#e1e0ea'),
  });
  const span = (ms) => {
    if (ms === null || ms === undefined) return '—';
    const minutes = ms / 60000;
    if (minutes < 60) return `${Math.round(minutes)} min`;
    if (minutes < 60 * 48) return `${(minutes / 60).toFixed(1)} h`;
    return `${(minutes / 1440).toFixed(1)} days`;
  };
  const week = (ms) => new Date(ms).toISOString().slice(5, 10);

  /** A chart on a canvas, made again when what it shows changes. */
  function chart(canvas, make) {
    let made = new Chart(canvas, make());
    return {
      update(next) {
        made.destroy();
        made = new Chart(canvas, next());
      },
      destroy() {
        made.destroy();
      },
    };
  }

  function axes(colors) {
    const tick = { color: colors.ink, font: { family: 'Geist Variable, sans-serif', size: 11 } };
    return {
      x: { ticks: { ...tick, precision: 0 }, grid: { color: colors.line }, beginAtZero: true },
      y: { ticks: { ...tick, precision: 0 }, grid: { color: colors.line }, beginAtZero: true },
    };
  }
  const flowChart = (stats) => () => {
    const colors = palette();
    const weeks = stats.flow.weeks;
    return {
      type: 'bar',
      data: {
        labels: weeks.map((one) => week(one.week_ms)),
        datasets: [
          { label: 'opened', data: weeks.map((one) => one.opened), backgroundColor: colors.accent },
          { label: 'integrated', data: weeks.map((one) => one.integrated), backgroundColor: colors.ok },
          { label: 'given up', data: weeks.map((one) => one.given_up), backgroundColor: colors.warn },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: axes(colors), plugins: { legend: { labels: { color: colors.ink } } } },
    };
  };
  const assistantChart = (stats) => () => {
    const colors = palette();
    const rows = stats.assistants;
    const label = (row) => `${row.assistant}${row.model ? ` · ${row.model}` : ''}`;
    return {
      type: 'bar',
      data: {
        labels: rows.map(label),
        datasets: [
          { label: 'integrated', data: rows.map((row) => row.integrated), backgroundColor: colors.ok },
          { label: 'conflicts', data: rows.map((row) => row.conflicts ?? 0), backgroundColor: colors.bad },
          { label: 'refused or held', data: rows.map((row) => (row.refused ?? 0) + (row.held ?? 0)), backgroundColor: colors.warn },
          { label: 'failed checks', data: rows.map((row) => row.failed_checks ?? 0), backgroundColor: colors.ink },
        ],
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: axes(colors), plugins: { legend: { labels: { color: colors.ink } } } },
    };
  };
  const hotChart = (stats) => () => {
    const colors = palette();
    const files = stats.hotspots.files.slice(0, 10);
    return {
      type: 'bar',
      data: {
        labels: files.map((file) => file.path),
        datasets: [
          { label: 'lanes', data: files.map((file) => file.lanes), backgroundColor: colors.accent },
          { label: 'conflicts', data: files.map((file) => file.conflicts), backgroundColor: colors.bad },
        ],
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: axes(colors), plugins: { legend: { labels: { color: colors.ink } } } },
    };
  };
</script>

<div class="top">
  <h1>Insights{repo ? ` · ${repo}` : team ? ' · every repository' : ''}</h1>
  <span class="grow"></span>
  <select bind:value={days}>{#each spans as [value, label]}<option {value}>{label}</option>{/each}</select>
</div>
{#if failed}<p class="error" role="alert">{failed}</p>{/if}
{#if all === null && !failed}<p class="soft">…</p>{/if}

{#each all ?? [] as { name, stats } (name)}
  {#if team && !repo}<h2 class="repo">{name}</h2>{/if}
  <div class="figures">
    <div class="panel figure"><b>{stats.flow.weeks.reduce((sum, one) => sum + one.opened, 0)}</b><span>lanes opened</span></div>
    <div class="panel figure"><b>{stats.flow.weeks.reduce((sum, one) => sum + one.integrated, 0)}</b><span>integrated</span></div>
    <div class="panel figure"><b>{stats.flow.open_now}</b><span>open now</span></div>
    <div class="panel figure"><b>{span(stats.flow.median_open_to_integrated_ms)}</b><span>open → integrated (median)</span></div>
    <div class="panel figure"><b>{span(stats.flow.median_to_first_review_ms)}</b><span>to a first review</span></div>
  </div>
  {#if stats.kept_from_ms}<p class="faint">Counted from {new Date(stats.kept_from_ms).toLocaleDateString()}, when Kito began keeping what happens here.</p>{/if}

  <div class="grid">
    <section class="panel box">
      <h3>Lanes, week by week</h3>
      {#if stats.flow.weeks.length > 0}
        <div class="canvas"><canvas use:chart={flowChart(stats)}></canvas></div>
      {:else}<p class="faint">Nothing yet in this time.</p>{/if}
    </section>
    <section class="panel box">
      <h3>Each assistant and model</h3>
      {#if stats.assistants.length > 0}
        <div class="canvas"><canvas use:chart={assistantChart(stats)}></canvas></div>
        <table>
          <thead><tr><th>Assistant</th><th>Lanes</th><th>Integrated</th><th>Rate</th></tr></thead>
          <tbody>
            {#each stats.assistants as row}
              <tr><td>{row.assistant}{row.model ? ` · ${row.model}` : ''}</td><td>{row.lanes}</td><td>{row.integrated}</td><td>{Math.round(row.integration_rate * 100)}%</td></tr>
            {/each}
          </tbody>
        </table>
      {:else}<p class="faint">No lane yet.</p>{/if}
    </section>
    <section class="panel box">
      <h3>Where the code is busy</h3>
      {#if stats.hotspots.files.length > 0}
        <div class="canvas"><canvas use:chart={hotChart(stats)}></canvas></div>
        {#if stats.hotspots.functions.length > 0}
          <p class="faint small">Functions: {stats.hotspots.functions.slice(0, 6).map((one) => `${one.name} (${one.lanes})`).join(', ')}</p>
        {/if}
      {:else}<p class="faint">Nothing changed yet.</p>{/if}
    </section>
    <section class="panel box">
      <h3>Review</h3>
      {#if stats.review.length > 0}
        <table>
          <thead><tr><th>Who</th><th>Approved</th><th>Asked for changes</th><th>First look</th></tr></thead>
          <tbody>
            {#each stats.review as row}
              <tr><td>{row.who}</td><td>{row.approved}</td><td>{row.changes_requested}</td><td>{span(row.median_ms)}</td></tr>
            {/each}
          </tbody>
        </table>
      {:else}<p class="faint">No review yet.</p>{/if}
    </section>
  </div>
{/each}

<style>
  .top {
    display: flex;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  .repo {
    margin-top: 24px;
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin: 12px 0;
  }
  .figure {
    padding: 10px 12px;
    display: grid;
  }
  .figure b {
    font-size: 22px;
  }
  .figure span {
    font-size: 12px;
    color: var(--soft);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 12px;
  }
  .box {
    padding: 12px 16px;
  }
  .box h3 {
    margin: 0 0 8px;
    font-size: 14px;
  }
  .canvas {
    position: relative;
    height: 220px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 13px;
  }
  th,
  td {
    text-align: left;
    padding: 4px 6px;
    border-bottom: 1px solid var(--line);
  }
  th {
    color: var(--soft);
    font-weight: 600;
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
  select {
    font: inherit;
    font-size: 13px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
  }
</style>
