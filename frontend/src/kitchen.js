// What the web client knows of a kitchen (kito-kitchen, ADR 0007): a
// repository of the server with a `kitchen.toml` at its root, and its
// parts by where their files are.
import { askIn } from './api.js';
import { count } from './format.js';

/** The text of a file of a repository's main lane, with the ID of its content; null: no such file. */
export async function readIn(repo, path) {
  const listed = await askIn(repo, 'lane_files', { paths: [path] });
  const blob = listed.files?.[0]?.blob;
  if (!blob) return null;
  const answer = await askIn(repo, 'get_blobs', { blobs: [blob] });
  const encoded = answer.blobs?.[blob];
  if (encoded === undefined) return null;
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return { text: new TextDecoder().decode(bytes), blob };
}

/** A text as `put_file` takes it: base64 of its UTF-8. */
export function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/** `name` and `about` of a `kitchen.toml`: the two lines a kitchen says of itself. */
export function manifest(text) {
  const said = {};
  for (const line of (text ?? '').split('\n')) {
    const found = line.match(/^\s*(name|about)\s*=\s*"((?:[^"\\]|\\.)*)"/);
    if (found) said[found[1]] = found[2].replace(/\\(.)/g, '$1');
  }
  return said;
}

/** The kind of part a file of a kitchen is: behaviour, concept, recipe, tool, instruction, or other. */
export function kindOf(path) {
  const rest = path.startsWith('parts/') ? path.split('/').slice(2).join('/') : path;
  if (rest === 'behaviour.md') return 'behaviour';
  if (rest.startsWith('concepts/')) return 'concept';
  if (rest.startsWith('recipes/')) return 'recipe';
  if (rest.startsWith('tools/')) return 'tool';
  if (rest.startsWith('instructions/')) return 'instruction';
  return 'other';
}

/** The part a file belongs to: '' for the kitchen's base, else `parts/<part>/`. */
export function partOf(path) {
  return path.startsWith('parts/') && path.split('/').length > 2 ? path.split('/')[1] : '';
}

/** The first line of a concept or recipe: what it is about. */
export function aboutOf(text) {
  const first = (text ?? '').split('\n').find((line) => line.trim() !== '') ?? '';
  return first.replace(/^#+\s*/, '').trim();
}

/**
 * Changes files of a repository the way code is changed: a lane opened
 * for them, each file put in it, then the lane asked to be integrated. `files`:
 * [path, text, base] (base: the ID of the content it was read as; null
 * for a new file). Answers the lane, and how the integration ended,
 * which is null when whoever asks may not integrate: then it waits in
 * the lane for somebody who may.
 */
export async function changeIn(repo, { agent, intent, files, integrate = true, waiting = () => {} }) {
  const lane = await askIn(repo, 'open_lane', { agent, intent, scope: files.map(([path]) => path) });
  const id = lane.id;
  for (const [path, text, base] of files) {
    const params = { lane: id, path, content: encode(text) };
    if (base) params.base = base;
    await askIn(repo, 'put_file', params);
  }
  if (!integrate) return { lane: id, result: null };
  const asked = await askIn(repo, 'request_integration', { lane: id });
  for (;;) {
    const job = await askIn(repo, 'integration_result', { job: asked.job, wait_ms: 25000 });
    if (job.state === 'done') {
      if (job.result?.result === 'integrated') {
        // Its work is in: the lane has nothing more to say.
        await askIn(repo, 'close_lane', { lane: id }).catch(() => {});
      }
      return { lane: id, result: job.result };
    }
    waiting(job.state === 'queued' ? `Waiting behind ${count(job.ahead, 'other lane')}…` : 'Merging and checking…');
  }
}
