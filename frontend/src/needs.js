// What waits for a person, and who is at work, across the repositories
// they may use. Read from what each repository already says of its lanes:
// nothing here is kept, or asked of anybody but the repositories.

import { askIn, mayIntegrate, taskLink, whyLink } from './api.js';
import { count, laneTitle } from './format.js';
import { lacking, sameCode, standing, taskStanding } from './standing.js';

/**
 * What a lane waits for from this person, or null: a tone (the one
 * `standing.js` gives the state behind it), a kind, and what is needed, in
 * a few words. `mine`: the lane was opened for them. `role`: what they may
 * do in its repository.
 */
export function needOf(lane, mine, role) {
  if (role === 'read') return null;
  const review = lane.review ?? '';
  const waits = lane.state === 'awaiting_approval';
  const asks = lane.proposed_by ?? lane.agent;
  const conflicts = lane.conflicts?.length ?? 0;
  if (conflicts > 0 && (mine || mayIntegrate(role))) {
    // Two changes that do not merge: somebody says which stands.
    if (lane.state !== 'ready') return { tone: 'bad', kind: 'conflict', what: `${count(conflicts, 'conflict')} to decide` };
    // Each has its decision, and the next integration applies them: unless a reviewer wants changes first.
    if (!review.includes('changes requested')) {
      return { tone: 'ok', kind: 'integrate', what: `${count(conflicts, 'conflict')} decided: integrate it again` };
    }
  }
  if (review.includes('changes requested')) {
    return mine ? { tone: 'bad', kind: 'changes', what: review } : null;
  }
  if (lacking(lane) > 0) {
    // An approval is somebody else's than the owner's, and is asked for when the lane asks to be integrated.
    return waits && !mine ? { tone: 'warn', kind: 'review', what: `${asks} asks for your review: ${review}` } : null;
  }
  if (!mayIntegrate(role)) return null;
  if (waits) return { tone: 'ok', kind: 'integrate', what: `${asks} asks you to integrate it${review ? ` (${review})` : ''}` };
  if (review.startsWith('approved') && mine) return { tone: 'ok', kind: 'integrate', what: `${review}: yours to integrate` };
  return null;
}

/**
 * Looks at every repository once. `user` is who is signed in (null on
 * one's own machine, where every lane is one's own business); `team` says
 * whether the repositories are named, in what is asked and in the links.
 *
 * Whatever it answers says where it is twice: `repo` (null when the
 * repository has no name to show) and `id`, for a page that writes each
 * its own way, and `where`, both in a line (`shop · lane/3`).
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
    const named = team ? repo.name : null;
    // Behind a server a link says which repository it leads into.
    const into = team ? `?repo=${encodeURIComponent(repo.name)}` : '';
    const link = (id) => `${into}#/lane/${id.replace('lane/', '')}`;
    const where = (id) => (team ? `${repo.name} · ${id}` : id);
    for (const lane of repo.lanes) {
      const need = needOf(lane, user === null || lane.owner === user, repo.role);
      if (need) {
        needs.push({ ...need, title: laneTitle(lane) ?? lane.id, repo: named, id: lane.id, where: where(lane.id), href: link(lane.id) });
      }
    }
    // Tasks (Kito 0.33): for this person, and those they asked for that may be closed.
    for (const task of repo.tasks ?? []) {
      if (repo.role === 'read') continue;
      const asked = user === null || task.by === user;
      const stands = taskStanding(task);
      let need = null;
      if (asked && stands.place === 'ready') {
        const why = task.thinks_done ? `${task.thinks_done} thinks it is done` : 'its lanes are closed';
        need = { tone: stands.tone, kind: 'task', what: `${why}: close it, or reopen it` };
      } else if (user !== null && task.for === user && task.state === 'open') {
        need = { tone: 'warn', kind: 'task', what: `asked of you by ${task.by}` };
      }
      if (need) needs.push({ ...need, title: task.title, repo: named, id: task.id, where: where(task.id), href: `${into}${taskLink(task.id)}` });
    }
    for (const lane of repo.board) {
      atWork.push({
        agent: lane.agent,
        assistant: lane.assistant ?? null,
        repo: named,
        id: lane.id,
        where: where(lane.id),
        href: link(lane.id),
        stands: standing(lane),
        last: lane.last_change_ms ?? 0,
      });
      // Two lanes on the same code are said once, whichever of them says it.
      for (const other of sameCode(lane.overlaps)) {
        const pair = [lane.id, other].sort();
        const what = lane.overlaps.find((one) => one.lane === other && one.kind === 'function')?.what ?? lane.overlaps.find((one) => one.lane === other)?.what;
        const key = `${repo.name} ${pair.join(' ')}`;
        if (overlaps.has(key)) continue;
        overlaps.set(key, {
          key,
          repo: named,
          lanes: pair.map((id) => ({ id, href: link(id) })),
          where: `${where(pair[0])} and ${pair[1]}`,
          what,
          // A directory is no page of its own.
          whatHref: what && !what.endsWith('/') ? `${into}${whyLink(what)}` : null,
        });
      }
    }
  }
  // Whoever changed something last comes first.
  atWork.sort((a, b) => b.last - a.last);
  return { repos: looked, needs, atWork: atWork.slice(0, 8), overlaps: [...overlaps.values()] };
}
