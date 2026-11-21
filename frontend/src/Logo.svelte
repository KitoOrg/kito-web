<script>
  // Kito's mark: lanes that come in and become one, and where they land.
  // The lanes take the colour of the text around them; the one they
  // become, and its end, the colour of the brand (`--mark`, when the
  // mark stands on something dark).
  let { size = 22 } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.4"
  stroke-linecap="round"
  aria-hidden="true"
>
  <path d="M3 5.5h4c4.6 0 3.7 6.5 8.3 6.5" />
  <path d="M3 18.5h4c4.6 0 3.7-6.5 8.3-6.5" />
  <path class="main" d="M3 12h12.3" />
  <circle class="end" cx="19" cy="12" r="3" />
</svg>

<style>
  svg {
    flex: none;
  }
  .main {
    stroke: var(--mark, var(--accent));
  }
  .end {
    fill: var(--mark, var(--accent));
    stroke: none;
  }
</style>
