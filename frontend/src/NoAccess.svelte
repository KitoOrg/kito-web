<script>
  // A page that is for others: said once, the same way wherever it happens.
  // `who`: `admins` (of the server) or `maintainers` (of the repository).
  import Empty from './Empty.svelte';
  import PageHead from './PageHead.svelte';

  let { title, who = 'admins' } = $props();
</script>

<PageHead {title} />
{#if who === 'admins'}
  <Empty title="For the admins of this server" />
{:else}
  <Empty title="For the maintainers of this repository" />
{/if}
