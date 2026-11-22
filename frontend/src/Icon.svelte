<script>
  // The few pictures the client uses, drawn the same way: 16px, one line
  // weight, the colour of the text around them. Never read aloud: what a
  // button with only a picture does is its `aria-label`.
  let { name, size = 16 } = $props();

  const paths = {
    menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
    close: 'M4 4l8 8M12 4l-8 8',
    'chevron-down': 'M4 6l4 4 4-4',
    'chevron-up': 'M4 10l4-4 4 4',
    plus: 'M8 3.5v9M3.5 8h9',
    back: 'M9.5 3.5L5 8l4.5 4.5',
    check: 'M3.5 8.5l3 3 6-7',
    external: 'M6.5 3.5h-3v9h9v-3M9 3.5h3.5V7M12.5 3.5L7.5 8.5',
    comment: 'M3 4.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7.5L5 13v-2H4.5A1.5 1.5 0 0 1 3 9.5z',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name] ?? ''} />
</svg>

<style>
  svg {
    flex: none;
    vertical-align: -3px;
  }
</style>
