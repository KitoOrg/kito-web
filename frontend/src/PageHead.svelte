<script>
  // The head of every page: its title — the words of its tab or menu
  // entry — and its actions on the right. It does not say what the page
  // is for: the documentation does, one press away (`docs`). A page about
  // one thing (a lane, a function, a kitchen) takes the thing as its
  // title, says the way back above it, and may give its facts in a line
  // (`lead`). It names the browser's tab too.
  import { docsLink } from './docs.js';
  import { shell } from './shell.svelte.js';
  import Icon from './Icon.svelte';

  // `docs`: the part of the documentation that explains the page.
  // `lead`: the facts of the thing shown, never what the page is;
  // `after`: right after the title (where the thing stands); `actions`:
  // buttons on the right. `name`: the short name for the browser's tab
  // when the title is long.
  let { title, name = title, mono = false, back = null, docs = null, lead = null, after = null, actions = null } = $props();

  $effect(() => {
    document.title = [name, shell.repo, 'Kito'].filter(Boolean).join(' · ');
  });
</script>

<header class="page-head">
  <div>
    {#if back}<div><a class="back" href={back.href}><Icon name="back" />{back.label}</a></div>{/if}
    <h1 class:mono>{title}</h1>
    {#if after}<span class="after">{@render after()}</span>{/if}
    {#if lead}<p class="lead">{@render lead()}</p>{/if}
  </div>
  {#if docs || actions}
    <div class="actions">
      {#if docs}
        <a class="button quiet sm" href={docsLink(docs)} target="_blank" rel="noreferrer">Docs <Icon name="external" size={12} /></a>
      {/if}
      {@render actions?.()}
    </div>
  {/if}
</header>
