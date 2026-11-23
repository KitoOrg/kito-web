<script>
  // The scope of a lane to open, as it is typed: the same field wherever a
  // lane is opened. `scopeItems` in format.js reads it.
  let { value = $bindable('') } = $props();
</script>

<label class="field">
  <span>Scope</span>
  <input class="mono" bind:value placeholder="src/shop.ts:total" />
  <span class="hint">Functions, files or directories, separated by spaces.</span>
</label>
