<script>
  // Why something did not work, said under what was pressed, and aloud to
  // whoever does not see the page.
  let { message = '' } = $props();
</script>

{#if message}<p class="error" role="alert">{message}</p>{/if}
