<script>
  // Whom a task is for, or who took it up: a face, and the name beside it
  // (`named`) or said only to whoever does not see the page, after
  // `said` ("for", "taken up by"). `names`: what `namesOf` in tasks.js
  // knows of who is who; `agent`: it is an agent whatever that says.
  // `user`: the reader, who is "you".
  import Face from './Face.svelte';

  let { name, names, user = null, named = false, small = true, said = 'for', agent = null } = $props();

  let isAgent = $derived(agent ?? names.isAgent(name));
</script>

<span class="someone">
  <Face {name} agent={isAgent} assistant={isAgent ? names.assistantOf(name) : null} {small} />
  {#if named}<span>{name === user ? 'you' : name}</span>{:else}<span class="sr">{said} {name === user ? 'you' : name}</span>{/if}
</span>

<style>
  .someone {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    vertical-align: middle;
  }
</style>
