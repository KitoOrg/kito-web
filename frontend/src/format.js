// How values are written, everywhere the same: times, sizes, counts, who
// did something for whom, the name of a lane.

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

/** The moment itself, as this reader writes dates: `22 Nov 2026, 19:01`. */
export const exact = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A day, where the day is what matters: `22 Dec 2026`. */
export const day = (ms) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** How long something took: `12 min`, `3.5 h`, `2.1 days`. */
export function span(ms) {
  if (ms === null || ms === undefined) return '–';
  const minutes = ms / 60000;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

/** `1 lane`, `3 lanes`; the plural is the word with an `s` unless given. */
export function count(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** `26.1 KB`, from bytes. */
export function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** What the server wrote, with its raw byte counts made readable: `26678 bytes` → `26.1 KB`. */
export function humanize(text) {
  return String(text ?? '').replace(/\b(\d+) bytes\b/g, (_, bytes) => size(Number(bytes)));
}

/** Who did it and for whom: `dana for bob`; alone when for nobody else. */
export function who(by, forWhom = null) {
  return forWhom && forWhom !== by ? `${by} for ${forWhom}` : by;
}

/** A lane as it is always written: `lane/3`, or its name when it has one (`staging`, `main`). */
export function laneName(lane) {
  const text = String(lane ?? '');
  return text.startsWith('lane/') || text === '' || isNaN(text) ? text : `lane/${text}`;
}

/**
 * The spans of time a list can be narrowed to: `[days, label]`, the same
 * words on every page. A page shows those it needs (`spans(7, 30, 90)`),
 * always ending with all of it.
 */
const SPANS = [
  [1, 'Last day'],
  [7, 'Last week'],
  [30, 'Last month'],
  [90, 'Last 3 months'],
  [365, 'Last year'],
];
export function spans(...days) {
  return [...SPANS.filter(([n]) => days.includes(n)), ['', 'Any time']];
}

/** A word or a sentence as it starts a line or names a choice: `waits for review` → `Waits for review`. */
export const sentence = (text) => String(text ?? '').replace(/^./, (first) => first.toUpperCase());

/** What a change did, in words: `PutFile` → `put file`. */
export const opName = (op) => String(op ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** Whether a lane is for a task of its repository (`task#3`), and not for one said in passing. */
export const tasked = (lane) => Boolean(lane.task?.startsWith('task#'));

/**
 * What a lane is called where lanes are listed and at the head of its own
 * page: what it is for, in its own words; null when it said nothing. A
 * task of the repository is no title: it is named beside it.
 */
export const laneTitle = (lane) => (tasked(lane) ? lane.intent : (lane.task ?? lane.intent)) ?? null;

/**
 * The line that connects a directory to a repository of the server this
 * page is of. `clients`: how a client reaches it, as the server says it
 * (its port, the fingerprint of its certificate, or that it is in the
 * clear on this machine); `token`: one to sign in with, just made.
 */
export function connectLine(clients, repo, token = null) {
  const address = `${location.hostname}:${clients?.port ?? '7421'}/${repo}`;
  const known = clients?.plain ? ' --plain' : clients?.fingerprint ? ` --fingerprint ${clients.fingerprint}` : '';
  return `kito connect ${address}${token ? ` --token ${token}` : ''}${known}`;
}
