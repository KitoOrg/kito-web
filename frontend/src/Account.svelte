<script>
  // Behind a server, for whoever is signed in: how they sign in to it,
  // and what changes that for themselves. `who.signs_in` is what the
  // server says of it (Kito 0.39.3): one that does not say cannot change it.
  import { ways } from './api.js';
  import { refresh } from './shell.svelte.js';
  import Empty from './Empty.svelte';
  import PageHead from './PageHead.svelte';
  import SignsIn from './SignsIn.svelte';

  let { who } = $props();

  let signIns = $state([]);
  ways()
    .then((said) => (signIns = (said.methods ?? []).filter((way) => way.ready !== false)))
    .catch(() => (signIns = []));
</script>

<PageHead title="Account" docs="account" />

{#if who.signs_in}
  <h2 class="section-title">Sign-in</h2>
  <SignsIn has={who.signs_in} ways={signIns} onchange={refresh} />
{:else}
  <Empty title="This server does not say how you sign in">It needs Kito 0.39.3 or later.</Empty>
{/if}
