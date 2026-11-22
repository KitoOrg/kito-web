<script>
  // The numbers of a repository (Kito 0.34): how lanes flow, each
  // assistant and model, where the code is busy, how review goes. Behind
  // a server with no repository chosen, every repository one after the other.
  import { askIn, whyLink } from './api.js';
  import { assistantOf } from './assistants.js';
  import { day, sentence, span, spans } from './format.js';
  import { outcome, verdictStanding } from './standing.js';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
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
  import { color } from 'chart.js/helpers';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Legend, Tooltip);

  let { repo = null, repos = [], team = false } = $props();

  const times = spans(30, 90, 365);
  let days = $state(90);
  let all = $state(null);
  let failed = $state('');
  // Asked for, and not here yet: at first, and each time the span of time changes.
  let loading = $state(true);

  async function load() {
    loading = true;
    const params = days ? { since_ms: Date.now() - Number(days) * 86400000 } : {};
    const names = repo || !team ? [team ? repo : null] : repos.map((one) => one.name);
    try {
      all = await Promise.all(names.map(async (name) => ({ name, stats: await askIn(name, 'stats', params) })));
      failed = '';
    } catch (error) {
      failed = error.message;
    }
    loading = false;
  }
  $effect(() => {
    days;
    load();
  });

  // What a link into a repository starts with, on the page of them all.
  const into = (name) => (team && name && name !== repo ? `?repo=${encodeURIComponent(name)}` : '');

  // A state's words where a label is: the first letter a capital.
  // What came of a lane or of an integration, in the words and the tone it has everywhere.
  const named = (word) => sentence(outcome(word).text);
  // A canvas cannot read `var(--…)`: a token of app.css, as it is now.
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const toned = (word) => token(`--${outcome(word).tone || 'soft'}`);
  // Counts of one tone side by side are told apart by how strong it is: the colour, mixed with the panel behind it.
  const weaker = (colour, share) => color(colour).mix(color(token('--panel')), share).hexString();
  // An assistant and its model, named as everywhere; the lanes nobody said anything of are counted together.
  const runsIn = (row) => (row.assistant === 'not said' ? 'Not said' : assistantOf({ name: row.assistant }).label);
  const total = (weeks, what) => weeks.reduce((sum, one) => sum + one[what], 0);

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

  /** What every chart is drawn with: the text and the lines of the page. */
  function look(more = {}) {
    const font = { family: token('--sans'), size: 12 };
    const [ink, line] = [token('--soft'), token('--line')];
    const scale = () => ({ ticks: { color: ink, font, precision: 0 }, grid: { color: line }, beginAtZero: true });
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: scale(), y: scale() },
      plugins: { legend: { labels: { color: ink, font } }, tooltip: { titleFont: font, bodyFont: font } },
      ...more,
    };
  }
  const flowChart = (stats) => () => {
    const weeks = stats.flow.weeks;
    return {
      type: 'bar',
      data: {
        labels: weeks.map((one) => day(one.week_ms)),
        datasets: [
          { label: 'Opened', data: weeks.map((one) => one.opened), backgroundColor: token('--accent') },
          { label: named('integrated'), data: weeks.map((one) => one.integrated), backgroundColor: toned('integrated') },
          { label: named('given_up'), data: weeks.map((one) => one.given_up), backgroundColor: toned('given_up') },
        ],
      },
      options: look(),
    };
  };
  const assistantChart = (stats) => () => {
    const rows = stats.assistants;
    return {
      type: 'bar',
      data: {
        labels: rows.map((row) => `${runsIn(row)}${row.model ? ` · ${row.model}` : ''}`),
        datasets: [
          { label: named('integrated'), data: rows.map((row) => row.integrated), backgroundColor: toned('integrated') },
          {
            label: sentence(`${outcome('refused').text} or ${outcome('held').text}`),
            data: rows.map((row) => (row.refused ?? 0) + (row.held ?? 0)),
            backgroundColor: weaker(toned('refused'), 0.45),
          },
          { label: named('failed_checks'), data: rows.map((row) => row.failed_checks ?? 0), backgroundColor: weaker(toned('failed_checks'), 0.7) },
          { label: 'Conflicts', data: rows.map((row) => row.conflicts ?? 0), backgroundColor: toned('conflicts') },
        ],
      },
      options: look({ indexAxis: 'y' }),
    };
  };
  const hotChart = (stats) => () => {
    const files = stats.hotspots.files.slice(0, 10);
    return {
      type: 'bar',
      data: {
        labels: files.map((file) => file.path),
        datasets: [
          { label: 'Lanes', data: files.map((file) => file.lanes), backgroundColor: token('--accent') },
          { label: 'Conflicts', data: files.map((file) => file.conflicts), backgroundColor: toned('conflicts') },
        ],
      },
      options: look({ indexAxis: 'y' }),
    };
  };
</script>

<PageHead title="Insights" docs="insights">
  {#snippet actions()}
    <select aria-label="Time" bind:value={days}>
      {#each times as [value, label] (value)}<option {value}>{label}</option>{/each}
    </select>
  {/snippet}
</PageHead>

{#if failed}
  <Err message={failed} />
{:else if loading || all === null}
  <Loading lines={4} />
{:else}
  {#each all as { name, stats } (name)}
    {#if team && !repo}
      <h2 class="section-title"><a href={`${into(name)}#/`}>{name}</a></h2>
    {/if}
    <div class="figures">
      <div class="panel pad figure"><span class="soft small">Lanes opened</span><span class="figure-value">{total(stats.flow.weeks, 'opened')}</span></div>
      <div class="panel pad figure">
        <span class="soft small">{named('integrated')}</span><span class="figure-value">{total(stats.flow.weeks, 'integrated')}</span>
      </div>
      <div class="panel pad figure"><span class="soft small">Open now</span><span class="figure-value">{stats.flow.open_now}</span></div>
      <div class="panel pad figure">
        <span class="soft small">Median from open to integrated</span><span class="figure-value">{span(stats.flow.median_open_to_integrated_ms)}</span>
      </div>
      <div class="panel pad figure">
        <span class="soft small">Median to a first review</span><span class="figure-value">{span(stats.flow.median_to_first_review_ms)}</span>
      </div>
    </div>
    {#if stats.kept_from_ms}
      <p class="footnote">Counted from {day(stats.kept_from_ms)}.</p>
    {/if}

    <div class="charts">
      <section class="panel pad box">
        <h3>Lanes, week by week</h3>
        {#if stats.flow.weeks.length > 0}
          <div class="canvas" role="img" aria-label="Lanes opened, integrated and given up, each week">
            <canvas use:chart={flowChart(stats)}></canvas>
          </div>
        {:else}
          <p class="none">None yet</p>
        {/if}
      </section>
      <section class="panel pad box">
        <h3>Each assistant and model</h3>
        {#if stats.assistants.length > 0}
          <div class="canvas" role="img" aria-label="What came of the lanes of each assistant and model">
            <canvas use:chart={assistantChart(stats)}></canvas>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Assistant</th><th>Lanes</th><th>{named('integrated')}</th><th>Rate</th></tr>
              </thead>
              <tbody>
                {#each stats.assistants as row}
                  <tr>
                    <td>{runsIn(row)}{#if row.model}&nbsp;· <span class="mono">{row.model}</span>{/if}</td>
                    <td>{row.lanes}</td>
                    <td>{row.integrated}</td>
                    <td>{Math.round(row.integration_rate * 100)}%</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="none">None yet</p>
        {/if}
      </section>
      <section class="panel pad box">
        <h3>Where the code is busy</h3>
        {#if stats.hotspots.files.length > 0}
          <div class="canvas" role="img" aria-label="The files most lanes were on, and their conflicts">
            <canvas use:chart={hotChart(stats)}></canvas>
          </div>
          {#if stats.hotspots.functions.length > 0}
            <h4>Lanes by function</h4>
            <p class="busy">
              {#each stats.hotspots.functions.slice(0, 6) as one}
                <span><a class="ref" href={`${into(name)}${whyLink(one.name)}`}>{one.name}</a> <span class="count">{one.lanes}</span></span>
              {/each}
            </p>
          {/if}
        {:else}
          <p class="none">None yet</p>
        {/if}
      </section>
      <section class="panel pad box">
        <h3>Review</h3>
        {#if stats.review.length > 0}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Who</th>
                  <th>{sentence(verdictStanding('approved').text)}</th>
                  <th>{sentence(verdictStanding('changes_requested').text)}</th>
                  <th>First look</th>
                </tr>
              </thead>
              <tbody>
                {#each stats.review as row}
                  <tr><td>{row.who}</td><td>{row.approved}</td><td>{row.changes_requested}</td><td>{span(row.median_ms)}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="none">None yet</p>
        {/if}
      </section>
    </div>
  {/each}
{/if}

<style>
  /* The few numbers of a repository, side by side. */
  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--gap);
  }
  .figure {
    display: grid;
    gap: 2px;
  }
  .figure-value {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
  }
  /* The charts, two side by side where there is room for two. */
  .charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
    gap: var(--gap);
    margin-top: var(--gap);
  }
  /* A chart is as wide as its card, and follows it when the card narrows. */
  .canvas {
    position: relative;
    height: 220px;
    min-width: 0;
  }
  .busy {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    overflow-wrap: anywhere;
  }
</style>
