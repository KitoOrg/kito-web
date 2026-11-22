// Where a thing stands, in at most three words and a tone: said the same
// way wherever it is shown. A lane, a task, what came of an integration,
// what a reviewer said. A page never words a state itself: it asks here.
//
// Tones: `ok` (went well, passes, ready), `warn` (waits for somebody),
// `bad` (stopped until somebody acts), `done` (over), `accent` (under
// way), or none (nothing to say of it).

/** The approvals a lane still lacks ("0 of 1 approval": 1); 0 when it needs none, or has them. */
export function lacking(lane) {
  const said = /(\d+) of (\d+) approval/.exec(lane.review ?? '');
  return said ? Math.max(0, Number(said[2]) - Number(said[1])) : 0;
}

/**
 * The other lanes on the very code a lane is on: the same function, or
 * one that calls it. A lane elsewhere in the same file is not one.
 */
export function sameCode(overlaps) {
  const close = (overlaps ?? []).filter((one) => ['function', 'caller'].includes(one.kind));
  return [...new Set(close.map((one) => one.lane))];
}

// Every place a lane can stand, by what stops it first: its words, its tone.
const LANE = {
  closed: ['closed', 'done'],
  integrating: ['integrating', 'accent'],
  conflicts: ['conflicts to decide', 'bad'],
  changes: ['changes requested', 'bad'],
  outside: ['outside its scope', 'bad'],
  review: ['waits for review', 'warn'],
  ready: ['ready to integrate', 'ok'],
  approved: ['approved', 'ok'],
  open: ['open', ''],
};

/** The places an open lane can stand that somebody acts on, in the order a list offers them. */
export const LANE_PLACES = ['review', 'ready', 'changes', 'conflicts', 'outside'];

/**
 * Where a lane stands, as a key: `closed`, `integrating`, `conflicts`,
 * `changes`, `outside`, `review` (it asked to be integrated and lacks an
 * approval), `ready` (it asked, and waits only for somebody who may
 * integrate), `approved`, `open`.
 */
export function placeOf(lane) {
  const review = lane.review ?? '';
  if (lane.state === 'closed') return 'closed';
  if (lane.state === 'integrating') return 'integrating';
  // `ready`: every conflict has a decision, the next integration applies them.
  if (lane.state === 'blocked' || (lane.conflicts?.length > 0 && lane.state !== 'ready')) return 'conflicts';
  if (review.includes('changes requested')) return 'changes';
  if (lane.out_of_scope?.length > 0) return 'outside';
  if (lane.state === 'awaiting_approval') return lacking(lane) > 0 ? 'review' : 'ready';
  if (review.startsWith('approved')) return 'approved';
  return 'open';
}

/** The words of a place a lane can stand: `waits for review`. */
export const placeWords = (place) => LANE[place]?.[0] ?? String(place ?? '');

/** `{ place, text, tone }` of a lane. */
export function standing(lane) {
  const place = placeOf(lane);
  const [text, tone] = LANE[place];
  return { place, text, tone };
}

const TASK = {
  open: ['open', ''],
  in_lane: ['in a lane', 'accent'],
  ready: ['ready to close', 'ok'],
  done: ['done', 'done'],
  dropped: ['dropped', 'done'],
};

/** The columns of a board of tasks, in order: where a task that was not dropped can stand. */
export const TASK_PLACES = ['open', 'in_lane', 'ready', 'done'];

/** The words of a place a task can stand: `ready to close`. */
export const taskWords = (place) => TASK[place]?.[0] ?? String(place ?? '').replaceAll('_', ' ');

/** `{ place, text, tone }` of a task: one an agent thinks done is ready to close, as one whose lanes are closed. */
export function taskStanding(task) {
  const over = task.state === 'done' || task.state === 'dropped';
  const place = !over && task.thinks_done ? 'ready' : task.state;
  const [text, tone] = TASK[place] ?? [taskWords(place), ''];
  return { place, text, tone };
}

// What came of asking for an integration, and what the insights count.
const OUTCOME = {
  integrated: ['integrated', 'ok'],
  nothing_to_integrate: ['nothing to integrate', ''],
  awaiting_approval: ['waits for review', 'warn'],
  // Counted of what is over: it had conflicts, and they were decided.
  conflicted: ['had conflicts', 'warn'],
  conflicts: ['conflicts to decide', 'bad'],
  failed_checks: ['checks failed', 'bad'],
  verification_failed: ['checks failed', 'bad'],
  failed: ['failed', 'bad'],
  refused: ['refused', 'bad'],
  out_of_scope: ['outside its scope', 'bad'],
  held: ['held', 'warn'],
  given_up: ['given up', 'done'],
};

/** `{ text, tone }` of an outcome as the daemon names it (`failed_checks`). */
export function outcome(word) {
  const [text, tone] = OUTCOME[word] ?? [String(word ?? '').replaceAll('_', ' '), ''];
  return { text, tone };
}

const VERDICT = {
  approved: ['approved', 'ok'],
  changes_requested: ['changes requested', 'bad'],
  request_changes: ['changes requested', 'bad'],
  commented: ['commented', ''],
  comment: ['commented', ''],
};

/** `{ text, tone }` of what a reviewer said, as the daemon names it (`changes_requested`). */
export function verdictStanding(word) {
  const [text, tone] = VERDICT[word] ?? [String(word ?? '').replaceAll('_', ' '), ''];
  return { text, tone };
}

/** What the ring before a check of a lane means, for whoever cannot see it. */
export const CHECK_WORDS = { ok: 'passes', warn: 'needs a look', bad: 'stops it', '': 'nothing to pass' };
