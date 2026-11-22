<script>
  // The head of every page: its title — the words of its tab or menu
  // entry — one line on what the page is, and its actions on the right.
  // A page about one thing (a lane, a function, a kitchen) takes the thing
  // as its title and says the way back above it. It names the browser's
  // tab too.
  import { shell } from './shell.svelte.js';
  import Icon from './Icon.svelte';

  // `lead`: a string, or a snippet; `after`: right after the title (where
  // the thing stands); `actions`: buttons on the right. `name`: the short
  // name for the browser's tab when the title is long.
  let { title, name = title, mono = false, back = null, lead = null, after = null, actions = null } = $props();

  $effect(() => {
    document.title = [name, shell.repo, 'Kito'].filter(Boolean).join(' · ');
  });
</script>

<header class="page-head">
  <div>
    {#if back}<div><a class="back" href={back.href}><Icon name="back" />{back.label}</a></div>{/if}
    <h1 class:mono>{title}</h1>
    {#if after}<span class="after">{@render after()}</span>{/if}
    {#if typeof lead === 'string'}
      <p class="lead">{lead}</p>
    {:else if lead}
      <p class="lead">{@render lead()}</p>
    {/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>
