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
    // The daemon's own code, when it said no itself (`-32601`: no such request).
    if (typeof body?.code === 'number') error.code = body.code;
    throw error;
  }
  return body;
}

// Behind a Kito server, for a team: the repository the client is looking
// at. The server itself is asked about it, as whoever is signed in.
let served = null;

/** From now on the client asks the server it is behind, about this repository. */
export function behindServer(repository) {
  served = repository;
}

/** One question for the daemon: a method of its API and its parameters. */
export async function ask(method, params = {}) {
  return askIn(served, method, params);
}

/**
 * The same question about a repository that is named: behind a server,
 * any of those one may use. Null: the one this program serves, on one's
 * own machine.
 */
export async function askIn(repository, method, params = {}) {
  // A page of another site cannot set these headers: they mark the client's own requests.
  const [address, mark] = repository === null ? ['api/call', 'x-kito-web'] : [`/-/api/${encodeURIComponent(repository)}`, 'x-kito'];
  const response = await fetch(address, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [mark]: '1' },
    body: JSON.stringify({ method, params }),
  });
  return read(response);
}

/** What this is: on this machine, whether this browser was given the address; behind a server, that it is. */
export async function info() {
  return read(await fetch('api/info'));
}

/** Behind a server: who is signed in and the repositories they may use; null: nobody. */
export async function me() {
  const response = await fetch('/-/me');
  return response.status === 401 ? null : read(response);
}

/** Behind a server: the ways to sign in that its plugins offer. */
export async function ways() {
  return read(await fetch('/-/sign-in'));
}

/** Behind a server: a session for whoever holds a token of it. */
export async function openSession(token) {
  const response = await fetch('/-/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return read(response);
}

/** Behind a server, for its administrators: its plugins, and what the registry lists. */
export async function adminPlugins() {
  return read(await fetch('/-/admin/plugins', { headers: { 'x-kito': '1' } }));
}

/** Behind a server, for its administrators: install, enable, disable or remove a plugin. */
export async function adminChange(body) {
  const response = await fetch('/-/admin/plugins', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kito': '1' },
    body: JSON.stringify(body),
  });
  return read(response);
}

/** Behind a server: its people (`server.people`, `_add`, `_remove`, `_role`), as whoever is signed in. */
export async function people(method, params = {}) {
  const response = await fetch('/-/people', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kito': '1' },
    body: JSON.stringify({ method, params }),
  });
  return read(response);
}

/** Behind a server: the session ends. */
export async function signOut() {
  return read(await fetch('/-/session', { method: 'DELETE' }));
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
        let answer;
        if (served === null) {
          const query = after === null ? '' : `?after=${after}`;
          answer = await read(await fetch(`api/events${query}`));
        } else {
          answer = await ask('events', { after, wait_ms: 20000 });
        }
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

// The requests the server said it does not have: a Kito older than this
// client. Found out from a request's own failure, and not asked again.
const missing = new Set();

/** Whether `error` says the server has no `method` (an older Kito, or a program that does not pass it on); remembered. */
export function lacks(error, method) {
  const unknown = error?.code === -32601 || (error?.status === 403 && error?.code === undefined);
  if (unknown) missing.add(method);
  return unknown;
}

/** Whether the server already said it has no `method`. */
export const lacked = (method) => missing.has(method);

/** The text of a content by its ID (`get_blobs`); null: none. */
export async function blobText(blob) {
  const answer = await ask('get_blobs', { blobs: [blob] });
  const encoded = answer.blobs?.[blob];
  if (encoded === undefined) return null;
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The text of a file as a lane has it (default: the main lane); null: no such file. */
export async function fileText(path, lane = null) {
  const params = { paths: [path] };
  if (lane) params.lane = lane;
  const listed = await ask('lane_files', params);
  const blob = listed.files?.[0]?.blob;
  return blob ? blobText(blob) : null;
}

/**
 * The address of a file or a directory (`dir`) in Code: as the main lane
 * has it now, as a lane has it (`lane`), or as it was at a checkpoint
 * (`at`). The root is `''`.
 */
export function codeLink(path, { at = null, lane = null, dir = false } = {}) {
  const parts = String(path ?? '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  const query = new URLSearchParams();
  if (at) query.set('at', at);
  if (lane) query.set('lane', lane);
  const said = query.toString();
  return `#/code${parts ? `/${parts}${dir ? '/' : ''}` : ''}${said ? `?${said}` : ''}`;
}

/** The address of the page that says why a function, a file or lines are the way they are: a file's is in Code. */
export function whyLink(target, lane = null) {
  const text = String(target);
  if (!text.includes(':')) return codeLink(text, { lane, dir: text.endsWith('/') });
  const query = lane ? `?lane=${encodeURIComponent(lane)}` : '';
  return `#/why/${encodeURIComponent(text)}${query}`;
}

/** The address of a checkpoint's page (`ckpt#4`). */
export function checkpointLink(id) {
  return `#/history/${encodeURIComponent(id)}`;
}

/** The address of the checkpoints that changed a file or a directory; the whole history without one. */
export function historyLink(path = null) {
  return path ? `#/history?path=${encodeURIComponent(path)}` : '#/history';
}

/** The address of a lane's page: `lane/3` or the name of a permanent one. */
export function laneLink(lane) {
  return `#/lane/${lane.replace(/^lane\//, '')}`;
}

/** The address of a task's page (`task#3`). */
export function taskLink(id) {
  return `#/tasks?task=${encodeURIComponent(id)}`;
}

// What a role in a repository lets one do. On one's own machine nothing
// says a role, and everything may be done.
export const mayWrite = (role) => role !== 'read';
export const mayIntegrate = (role) => !role || role === 'integrate' || role === 'maintain';

/** Puts the cursor in a field as soon as it is on the page (`use:focus`). */
export function focus(node) {
  node.focus();
}

// How values are written lives in `format.js`; `ago` is still asked for here.
export { ago } from './format.js';
