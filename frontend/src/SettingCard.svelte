<script>
  // One setting: what it is called and where it stands, what it means,
  // its controls, and who changed it last. Every setting of a repository
  // is one of these, whoever it belongs to (Kito, or a plugin).
  // `about`: a string or a snippet; `state`: a chip for where it stands,
  // if it stands somewhere; `history`: the lines of who changed it.
  let { title, about = null, state = null, children = null, history = null } = $props();
</script>

<section class="panel pad setting">
  <div class="head">
    <h3>{title}</h3>
    {@render state?.()}
  </div>
  {#if typeof about === 'string'}
    <p class="soft">{about}</p>
  {:else if about}
    <p class="soft">{@render about()}</p>
  {/if}
  {@render children?.()}
  {@render history?.()}
</section>
