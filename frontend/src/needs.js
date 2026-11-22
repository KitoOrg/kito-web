// What waits for a person, and who is at work, across the repositories
// they may use. Read from what each repository already says of its lanes:
// nothing here is kept, or asked of anybody but the repositories.

import { askIn } from './api.js';
import { lacking, sameCode } from './standing.js';

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * What a lane waits for from this person, or null. `mine`: the lane was
 * opened for them. `role`: what they may do in its repository.
 */
export function needOf(lane, mine, role) {
  if (role === 'read') return null;
  const review = lane.review ?? '';
  const waits = lane.state === 'awaiting_approval';
  if (lane.conflicts?.length > 0 && (mine || role === 'integrate')) {
    // Two changes that do not merge: somebody says which stands.
    return { tone: 'bad', kind: 'conflict', what: `${count(lane.conflicts.length, 'conflict', 'conflicts')} to decide` };
  }
  if (review.includes('changes requested')) {
    return mine ? { tone: 'bad', kind: 'changes', what: review } : null;
  }
  if (lacking(lane) > 0) {
    // An approval is somebody else's than the owner's, and is asked for when the lane asks to go in.
    return waits && !mine ? { tone: 'warn', kind: 'review', what: `${lane.proposed_by ?? lane.agent} asks for your review: ${review}` } : null;
  }
  if (role !== 'integrate') return null;
  if (waits) {
    const said = review ? `${review}, and ` : '';
    return { tone: 'ok', kind: 'integrate', what: `${said}${lane.proposed_by ?? lane.agent} asks for it to go in: yours to integrate` };
  }
  if (review.startsWith('approved') && mine) return { tone: 'ok', kind: 'integrate', what: `${review}: yours to integrate` };
  return null;
}

/**
 * Looks at every repository once. `user` is who is signed in (null on
 * one's own machine, where every lane is one's own business); `team` says
 * whether the repositories are named, in what is asked and in the links.
 */
export async function survey(repos, user, team) {
  const looked = await Promise.all(
    repos.map(async (repo) => {
      try {
        // On one's own machine there is one repository, and it is not named.
        const named = team ? repo.name : null;
        const [lanes, board, tasks] = await Promise.all([
          askIn(named, 'lanes'),
          askIn(named, 'board'),
          // A Kito before 0.33 has no tasks: nothing waits there.
          askIn(named, 'tasks').catch(() => []),
        ]);
        return { ...repo, lanes, board, tasks };
      } catch (error) {
        // One repository that cannot be asked does not hide the others.
        return { ...repo, lanes: [], board: [], tasks: [], error: error.message };
      }
    }),
  );
  const [needs, atWork, overlaps] = [[], [], new Map()];
  for (const repo of looked) {
    const link = (id) => `${team ? `?repo=${encodeURIComponent(repo.name)}` : ''}#/lane/${id.replace('lane/', '')}`;
    const where = (id) => (team ? `${repo.name} · ${id}` : id);
    for (const lane of repo.lanes) {
      const need = needOf(lane, user === null || lane.owner === user, repo.role);
      if (need) needs.push({ ...need, title: lane.task ?? lane.intent ?? lane.id, where: where(lane.id), href: link(lane.id) });
    }
    // Tasks (Kito 0.33): for this person, and those they asked for that may be closed.
    const taskLink = (id) => `${team ? `?repo=${encodeURIComponent(repo.name)}` : ''}#/tasks?task=${encodeURIComponent(id)}`;
    for (const task of repo.tasks ?? []) {
      if (repo.role === 'read') continue;
      const asked = user === null || task.by === user;
      let need = null;
      if (asked && (task.state === 'ready' || task.thinks_done)) {
        const why = task.thinks_done ? `${task.thinks_done} thinks it is done` : 'its lanes are closed';
        need = { tone: 'ok', kind: 'task', what: `${why}: close it, or reopen it` };
      } else if (user !== null && task.for === user && task.state === 'open') {
        need = { tone: 'warn', kind: 'task', what: `asked of you by ${task.by}` };
      }
      if (need) needs.push({ ...need, title: task.title, where: team ? `${repo.name} · ${task.id}` : task.id, href: taskLink(task.id) });
    }
    for (const lane of repo.board) {
      atWork.push({ agent: lane.agent, assistant: lane.assistant ?? null, where: where(lane.id), href: link(lane.id), state: lane.state, last: lane.last_change_ms ?? 0 });
      // Two lanes on the same code are said once, whichever of them says it.
      for (const other of sameCode(lane.overlaps)) {
        const pair = [lane.id, other].sort();
        const what = lane.overlaps.find((one) => one.lane === other && one.kind === 'function')?.what ?? lane.overlaps.find((one) => one.lane === other)?.what;
        const key = `${repo.name} ${pair.join(' ')}`;
        if (!overlaps.has(key)) overlaps.set(key, { key, where: `${where(pair[0])} and ${pair[1]}`, href: link(pair[0]), what });
      }
    }
  }
  // Whoever changed something last comes first.
  atWork.sort((a, b) => b.last - a.last);
  return { repos: looked, needs, atWork: atWork.slice(0, 8), overlaps: [...overlaps.values()] };
}
