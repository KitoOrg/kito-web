<script>
  // Whom something is for, or who works in a lane: chosen from the people
  // and the agents a repository knows, or typed when it is somebody new.
  // Pressed, it opens a short list under it, with a field on top that
  // narrows it; Enter takes the one marked, Escape leaves it as it was.
  // What choosing does is the page's (`onpick(name)`, '' for nobody).
  import { tick } from 'svelte';
  import Face from './Face.svelte';
  import Icon from './Icon.svelte';

  // `names`: from `namesOf` in tasks.js. `nobody`: "Nobody" is a choice,
  // and what is shown when nothing is chosen (else `empty`). `people`:
  // people are offered, not only agents. `label`: what it chooses, for
  // whoever does not see the page. `wide`: a field of a form, as wide as
  // the fields around it.
  let {
    value = '',
    names,
    user = null,
    label,
    nobody = true,
    people = true,
    empty = 'Nobody',
    disabled = false,
    small = false,
    wide = false,
    onpick,
  } = $props();

  const id = $props.id();
  let open = $state(false);
  let typed = $state('');
  let active = $state(0);
  let at = $state({ top: 0, left: 0, width: 260 });
  let trigger = $state(null);
  let pop = $state(null);

  const shown = (name) => (name === user ? `${name} (you)` : name);

  // The choices, in groups, each with its place in the whole list.
  let groups = $derived.by(() => {
    const want = typed.trim();
    const fits = (name) => name.toLowerCase().includes(want.toLowerCase());
    const persons = people ? names.people.filter(fits) : [];
    const agents = names.agents.filter((one) => fits(one.name) && !persons.includes(one.name));
    const known = [...names.people, ...names.agents.map((one) => one.name)];
    const found = [];
    if (nobody && !want) found.push({ head: '', items: [{ name: '' }] });
    if (persons.length > 0) found.push({ head: 'People', items: persons.map((name) => ({ name })) });
    if (agents.length > 0) found.push({ head: 'Agents', items: agents.map((one) => ({ name: one.name, agent: true, assistant: one.assistant })) });
    if (want && !known.includes(want)) found.push({ head: '', items: [{ name: want, fresh: true }] });
    let n = 0;
    for (const group of found) for (const item of group.items) item.at = n++;
    return found;
  });
  let total = $derived(groups.reduce((sum, group) => sum + group.items.length, 0));
  let current = $derived(value ? { name: value, agent: names.isAgent(value), assistant: names.assistantOf(value) } : null);

  async function show() {
    const box = trigger.getBoundingClientRect();
    const width = Math.min(280, innerWidth - 24);
    const left = Math.max(12, Math.min(box.left, innerWidth - width - 12));
    at = { top: box.bottom + 4, left, width };
    typed = '';
    active = 0;
    open = true;
    await tick();
    // Above the button when there is no room under it.
    const height = pop?.offsetHeight ?? 0;
    if (at.top + height > innerHeight - 12 && box.top - 4 - height > 12) at = { ...at, top: box.top - 4 - height };
    pop?.querySelector('input')?.focus();
  }
  function hide(back = true) {
    open = false;
    if (back) trigger?.focus();
  }
  function choose(item) {
    hide();
    if (item.name !== value) onpick(item.name);
  }

  function key(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = total === 0 ? 0 : (active + step + total) % total;
      pop?.querySelector(`#${CSS.escape(`${id}-${active}`)}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = groups.flatMap((group) => group.items).find((one) => one.at === active);
      if (item) choose(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hide();
    } else if (event.key === 'Tab') {
      hide(false);
    }
  }

  $effect(() => {
    if (!open) return;
    const away = (event) => {
      if (!pop?.contains(event.target) && !trigger?.contains(event.target)) hide(false);
    };
    const moved = (event) => {
      if (!pop?.contains(event.target)) hide(false);
    };
    const resized = () => hide(false);
    addEventListener('mousedown', away);
    addEventListener('scroll', moved, true);
    addEventListener('resize', resized);
    return () => {
      removeEventListener('mousedown', away);
      removeEventListener('scroll', moved, true);
      removeEventListener('resize', resized);
    };
  });
</script>

{#snippet face(item)}
  <Face name={item.name} agent={item.agent} assistant={item.assistant} small />
{/snippet}

<button
  bind:this={trigger}
  type="button"
  class={['picked', small && 'sm', wide && 'wide']}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={`${label}: ${value ? shown(value) : empty}`}
  {disabled}
  onclick={() => (open ? hide() : show())}
  onkeydown={(event) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      show();
    }
  }}
>
  {#if current}
    {@render face(current)}<span class="name">{value === user ? 'you' : value}</span>
  {:else}
    <span class="none">{empty}</span>
  {/if}
  <Icon name="chevron-down" size={12} />
</button>

{#if open}
  <div bind:this={pop} class="panel pop" style:top={`${at.top}px`} style:left={`${at.left}px`} style:width={`${at.width}px`}>
    <input
      bind:value={typed}
      oninput={() => (active = 0)}
      onkeydown={key}
      role="combobox"
      aria-label={label}
      aria-expanded="true"
      aria-controls={`${id}-list`}
      aria-autocomplete="list"
      aria-activedescendant={total > 0 ? `${id}-${active}` : undefined}
      placeholder={people ? 'A name' : 'An agent'}
      autocomplete="off"
      spellcheck="false"
    />
    <div class="choices" id={`${id}-list`} role="listbox" aria-label={label}>
      {#each groups as group, g (g)}
        <div role="group" aria-label={group.head || undefined}>
          {#if group.head}<div class="group-head small soft" aria-hidden="true">{group.head}</div>{/if}
          {#each group.items as item (item.at)}
            <button
              type="button"
              class="bare choice"
              id={`${id}-${item.at}`}
              role="option"
              tabindex="-1"
              aria-selected={item.at === active}
              onmouseenter={() => (active = item.at)}
              onclick={() => choose(item)}
            >
              {#if item.name === ''}
                <span class="none">Nobody</span>
              {:else}
                {@render face(item)}<span class="name">{shown(item.name)}</span>
                {#if item.fresh}<span class="tag">new</span>{/if}
              {/if}
              {#if item.name === value}<Icon name="check" size={14} />{/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* A long name is cut where the room ends. */
  .picked {
    max-width: 100%;
    overflow: hidden;
  }
  /* A field of a form: read like the fields around it, its words at the left and the chevron at the end. */
  .picked.wide {
    width: 100%;
    justify-content: flex-start;
    padding-inline: 10px;
  }
  .picked.wide > :global(svg) {
    margin-left: auto;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pop {
    position: fixed;
    z-index: 60;
    display: grid;
    gap: 4px;
    padding: 6px;
    box-shadow: var(--menu-shadow);
  }
  .pop input {
    width: 100%;
  }
  .choices {
    max-height: 260px;
    overflow-y: auto;
  }
  .group-head {
    padding: 6px 8px 2px;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: var(--control-sm);
    padding: 0 8px;
    border-radius: var(--radius);
    white-space: nowrap;
  }
  .choice .name {
    flex: 1;
  }
  .choice[aria-selected='true'] {
    background: var(--hover);
  }
</style>
