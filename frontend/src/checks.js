// What stands between a lane and the lane it is integrated into, as far
// as can be said before it asks: each thing with a tone (`ok`, `warn`,
// `bad`, or nothing when there is nothing to pass) and a sentence.
import { count } from './format.js';

/**
 * `info`: the lane; `diff`: what it changes; `review`: where its review
 * stands; `checks`: the commands the repository runs on a merged result;
 * `conflicts`: those no integration applied a decision to yet. A row may
 * carry `items`: what its sentence is about, as it is typed.
 */
export function checksOf({ info, diff, review, checks, conflicts }) {
  const onto = diff?.onto ?? 'main';
  const rows = [];

  if (conflicts.length > 0) {
    const decided = conflicts.filter((conflict) => conflict.resolution).length;
    rows.push({
      name: 'Merge',
      tone: decided === conflicts.length ? 'warn' : 'bad',
      text:
        decided === conflicts.length
          ? `${count(conflicts.length, 'conflict is', 'conflicts are')} decided: the next integration applies ${conflicts.length === 1 ? 'it' : 'them'}.`
          : `${count(conflicts.length - decided, 'conflict')} with ${onto} to decide.`,
    });
  } else if (diff?.behind > 0) {
    rows.push({
      name: 'Merge',
      tone: 'warn',
      text: `${onto} changed ${count(diff.behind, 'file')} since this lane started. The two are merged when it asks to be integrated: nothing says yet whether they agree.`,
    });
  } else {
    rows.push({ name: 'Merge', tone: 'ok', text: `It starts from ${onto} as it is now.` });
  }

  const outside = info.out_of_scope ?? [];
  rows.push(
    outside.length > 0
      ? { name: 'Scope', tone: 'bad', text: 'It changed what is outside its scope: it is not integrated until its scope is extended or the change undone.', items: outside }
      : { name: 'Scope', tone: 'ok', text: 'Nothing was changed outside its scope.' },
  );

  const said = review?.verdicts?.length > 0;
  if (review?.changes_requested_by?.length > 0) {
    rows.push({ name: 'Review', tone: 'bad', text: `Changes requested by ${review.changes_requested_by.join(', ')}.` });
  } else if (review?.missing) {
    rows.push({ name: 'Review', tone: 'warn', text: `${review.missing}. An approval comes from somebody other than the person the lane is for.` });
  } else if (review?.approved_by?.length > 0) {
    rows.push({ name: 'Review', tone: 'ok', text: `Approved by ${review.approved_by.join(', ')}.` });
  } else {
    rows.push({ name: 'Review', tone: '', text: review?.required > 0 ? 'No verdict yet.' : `No approval is needed here${said ? '' : ', and no verdict was given'}.` });
  }

  rows.push(
    checks.length > 0
      ? { name: 'Check commands', tone: '', text: 'Run on the merged result when the lane asks to be integrated; one that fails stops it.', items: checks }
      : { name: 'Check commands', tone: '', text: 'This repository runs none before a lane is integrated.' },
  );

  if (review?.comments > 0) {
    rows.push({ name: 'Comments', tone: 'warn', text: `${count(review.comments, 'comment waits', 'comments wait')} for an answer or to be resolved.` });
  }
  return rows;
}

/** How many of them stop the lane, or will. */
export const stopping = (rows) => rows.filter((row) => row.tone === 'bad').length;
