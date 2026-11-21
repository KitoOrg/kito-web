// What the client asks the program that serves it, which asks the daemon.

async function read(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // An answer that is no JSON says nothing more than its status.
  }
  if (!response.ok) {
    const error = new Error(body?.error ?? `the server answered ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

/** One question for the daemon: a method of its API and its parameters. */
export async function ask(method, params = {}) {
  const response = await fetch('/api/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kito-web': '1' },
    body: JSON.stringify({ method, params }),
  });
  return read(response);
}

/** What this is, and whether this browser was given the address. */
export async function info() {
  return read(await fetch('/api/info'));
}

/**
 * Calls `told` with the events of the repository as they happen, until the
 * function it returns is called. The answer to each question waits for
 * something to tell.
 */
export function watch(told) {
  let stopped = false;
  let after = null;
  (async () => {
    while (!stopped) {
      try {
        const query = after === null ? '' : `?after=${after}`;
        const answer = await read(await fetch(`/api/events${query}`));
        if (stopped) return;
        const first = after === null;
        after = answer.next;
        // The first answer only says where the numbering is.
        if (!first && answer.events.length > 0) told(answer.events);
      } catch (error) {
        if (error.status === 401) return;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  })();
  return () => {
    stopped = true;
  };
}

/** The text of a file as a lane has it (default: the main lane); null: no such file. */
export async function fileText(path, lane = null) {
  const params = { paths: [path] };
  if (lane) params.lane = lane;
  const listed = await ask('lane_files', params);
  const blob = listed.files?.[0]?.blob;
  if (!blob) return null;
  const answer = await ask('get_blobs', { blobs: [blob] });
  const encoded = answer.blobs?.[blob];
  if (encoded === undefined) return null;
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The address of the page that says why a function, a file or lines are the way they are. */
export function whyLink(target, lane = null) {
  const query = lane ? `?lane=${encodeURIComponent(lane)}` : '';
  return `#/why/${encodeURIComponent(target)}${query}`;
}

/** The address of a lane's page: `lane/3` or the name of a permanent one. */
export function laneLink(lane) {
  return `#/lane/${lane.replace(/^lane\//, '')}`;
}

/** Puts the cursor in a field as soon as it is on the page (`use:focus`). */
export function focus(node) {
  node.focus();
}

/** `3 minutes ago`, from milliseconds since 1970. */
export function ago(ms) {
  if (!ms) return '';
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  const units = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Infinity, 'year'],
  ];
  let value = seconds;
  for (const [size, name] of units) {
    if (value < size) return value <= 1 && name === 'second' ? 'just now' : `${value} ${name}${value === 1 ? '' : 's'} ago`;
    value = Math.floor(value / size);
  }
  return '';
}
