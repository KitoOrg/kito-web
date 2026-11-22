<script>
  // A line to run or to pass on, with the button that copies it. A long
  // one scrolls in its own box.
  import { toast } from './toast.svelte.js';

  let { text } = $props();

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast('Not copied: select the line and copy it', 'warn');
    }
  }
</script>

<div class="line">
  <pre>{text}</pre>
  <button type="button" class="sm" onclick={copy}>Copy</button>
</div>

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  pre {
    flex: 1;
    min-width: 0;
  }
</style>
