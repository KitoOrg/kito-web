// What the Tasks page works out of the tasks, the lanes and the people:
// who a task can be for, which tasks a filter keeps and in what order,
// and what happened to one task, in order.
import { TASK_PLACES, taskStanding } from './standing.js';

/**
 * Whom a task can be for: `people` (the repository's, when the server
 * says them to the reader; else every name seen that is not an agent's)
 * and `agents` (each agent of a lane, with the assistant its latest lane
 * said it runs in). `members`: the repository's people, or null.
 */
export function namesOf({ tasks, lanes, members, user }) {
  const agents = new Map();
  for (const lane of lanes ?? []) {
    if (!lane.agent) continue;
    // The lanes come oldest first: the latest that said an assistant wins.
    agents.set(lane.agent, lane.assistant?.name ? lane.assistant : (agents.get(lane.agent) ?? null));
  }
  let people;
  if (members) {
    people = [...members];
  } else {
    const seen = new Set();
    for (const task of tasks ?? []) {
      seen.add(task.by);
      if (task.for) seen.add(task.for);
      for (const said of task.comments ?? []) seen.add(said.by);
    }
    for (const lane of lanes ?? []) if (lane.owner) seen.add(lane.owner);
    people = [...seen].filter((name) => name && !agents.has(name));
  }
  if (user && !people.includes(user)) people.push(user);
  people.sort((a, b) => (a === user ? -1 : b === user ? 1 : a.localeCompare(b)));
  const agentList = [...agents].map(([name, assistant]) => ({ name, assistant })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    people,
    agents: agentList,
    /** Whether a name is an agent's, and not a person's. */
    isAgent: (name) => agents.has(name) && !people.includes(name),
    assistantOf: (name) => agents.get(name) ?? null,
  };
}

/** The number of a task (`task#12` → 12). */
export const taskNumber = (task) => Number(String(task.id).replace(/\D/g, '')) || 0;

// Where a task stands, in the order of the board, the dropped last.
const placeAt = (task) => {
  const at = [...TASK_PLACES, 'dropped'].indexOf(taskStanding(task).place);
  return at < 0 ? TASK_PLACES.length : at;
};

/** The orders a list of tasks can be in: `[key, words of the choice, compare]`. */
export const TASK_ORDERS = [
  ['updated', 'By last change', (a, b) => b.updated_ms - a.updated_ms],
  ['newest', 'Newest first', (a, b) => b.at_ms - a.at_ms],
  ['id', 'By id', (a, b) => taskNumber(a) - taskNumber(b)],
  ['state', 'By state', (a, b) => placeAt(a) - placeAt(b) || b.updated_ms - a.updated_ms],
];

/** The tasks a filter keeps, in the order asked. `whom`: '' everybody, `nobody`, or a name. */
export function filterTasks(tasks, { q = '', whom = '', sort = 'updated' }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const compare = (TASK_ORDERS.find(([key]) => key === sort) ?? TASK_ORDERS[0])[2];
  return (tasks ?? [])
    .filter((task) => {
      if (whom === 'nobody' ? Boolean(task.for) : whom !== '' && task.for !== whom) return false;
      const text = `${task.id} ${task.title} ${task.text ?? ''}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort(compare);
}

/**
 * What happened to a task, oldest first: each entry `{ key, at_ms, what,
 * … }`, a comment as `{ what: 'comment', said }`. From its `history`
 * (Kito 0.41) when the server gives it, and its comments. That it was
 * asked, by whom and when, is said at its head: not here again.
 */
export function happenings(task) {
  const comments = task.comments ?? [];
  const events = Array.isArray(task.history) ? task.history.filter((entry) => !['comment', 'asked'].includes(entry.what)) : [];
  // Every comment is in its place, whether the history names it or not.
  const all = [
    ...events.map((entry, at) => ({ ...entry, key: `e${at}` })),
    ...comments.map((said) => ({ what: 'comment', said, at_ms: said.at_ms, key: `c${said.n}` })),
  ];
  return all.sort((a, b) => (a.at_ms ?? 0) - (b.at_ms ?? 0));
}
