// What was just done, said for a moment in a corner of the page, without
// pushing anything down: "Saved", "Invited ada", "Plugin installed".
export const toasts = $state([]);

let next = 0;

/** Say `text` for a few seconds; `tone` is ok, warn or bad. */
export function toast(text, tone = 'ok') {
  const id = ++next;
  toasts.push({ id, text, tone });
  setTimeout(() => dismiss(id), tone === 'bad' ? 6000 : 3500);
}

export function dismiss(id) {
  const at = toasts.findIndex((one) => one.id === id);
  if (at >= 0) toasts.splice(at, 1);
}
