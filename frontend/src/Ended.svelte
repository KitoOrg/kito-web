<script>
  // How a closed lane ended (Kito 0.41): integrated, into which lane and
  // as which checkpoint, or closed without integrating; and who closed it
  // and when, where the server kept it. `links`: its refs lead to their
  // pages (not inside a row that is itself a link). `capital`: it starts
  // a line.
  import { checkpointLink, laneLink } from './api.js';
  import { laneName, sentence } from './format.js';
  import Time from './Time.svelte';

  let { lane, links = true, capital = false } = $props();

  // Where its work went, each once, with the checkpoints it made there.
  let into = $derived.by(() => {
    const found = new Map();
    for (const one of lane.integrations ?? []) {
      if (!found.has(one.into)) found.set(one.into, []);
      if (one.checkpoint) found.get(one.into).push(one.checkpoint);
    }
    return [...found];
  });
  let closer = $derived(lane.closed ?? {});
  const word = (text) => (capital ? sentence(text) : text);
  // `a, b and c`
  const joiner = (at, all) => (at === 0 ? '' : at === all - 1 ? ' and ' : ', ');
</script>

{#snippet ref(text, href)}{#if links && href}<a class="ref" {href}>{text}</a>{:else}<span class="ref">{text}</span>{/if}{/snippet}

{#snippet by()}{#if closer.by}{' '}by {closer.by}{/if}{#if closer.at_ms}{' '}<Time ms={closer.at_ms} />{/if}{/snippet}

{#if into.length === 0}
  {word('closed without integrating')}{@render by()}
{:else}
  <!-- Every space is written out: none depends on where the lines of this file break. -->
  {word('integrated')}{#each into as [where, points], n (where)}{n > 0 ? ',' : ''}{' into '}{@render ref(laneName(where), where === 'main' ? null : laneLink(where))}{#if points.length > 0}{' as '}{#each points as point, k (point)}{joiner(k, points.length)}{@render ref(point, checkpointLink(point))}{/each}{/if}{/each}{#if closer.by || closer.at_ms}{' · closed'}{@render by()}{/if}
{/if}
