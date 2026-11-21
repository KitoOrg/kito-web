// What stands between a lane and the lane it lands on, as far as can be
// said before it asks to go in: each thing with a tone (`ok`, `warn`,
// `bad`, or nothing when there is nothing to pass) and a sentence.

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * `info`: the lane; `diff`: what it changes; `review`: where its review
 * stands; `checks`: the commands the repository runs on a merged result;
 * `conflicts`: those not decided yet.
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
          : `${count(conflicts.length - decided, 'conflict', 'conflicts')} with ${onto} to decide.`,
    });
  } else if (diff?.behind > 0) {
    rows.push({
      name: 'Merge',
      tone: 'warn',
      text: `${onto} changed ${count(diff.behind, 'file', 'files')} since this lane started. It is merged with them when it asks to go in: nothing says yet whether they agree.`,
    });
  } else {
    rows.push({ name: 'Merge', tone: 'ok', text: `It starts from ${onto} as it is now.` });
  }

  const outside = info.out_of_scope ?? [];
  rows.push(
    outside.length > 0
      ? { name: 'Scope', tone: 'bad', text: `Changed outside what it declared: ${outside.join(', ')}. It is not integrated until its scope is extended or the change undone.` }
      : { name: 'Scope', tone: 'ok', text: 'Nothing was changed outside what it declared.' },
  );

  const said = review?.verdicts?.length > 0;
  if (review?.changes_requested_by?.length > 0) {
    rows.push({ name: 'Review', tone: 'bad', text: `Changes requested by ${review.changes_requested_by.join(', ')}.` });
  } else if (review?.missing) {
    rows.push({ name: 'Review', tone: 'warn', text: `${review.missing}. An approval is somebody else's than the lane's owner.` });
  } else if (review?.approved_by?.length > 0) {
    rows.push({ name: 'Review', tone: 'ok', text: `Approved by ${review.approved_by.join(', ')}.` });
  } else {
    rows.push({ name: 'Review', tone: '', text: review?.required > 0 ? 'No verdict yet.' : `No approval is needed here${said ? '' : ', and no verdict was given'}.` });
  }

  rows.push(
    checks.length > 0
      ? { name: 'Checks of the repository', tone: '', text: 'Run on the merged result when the lane asks to go in; one that fails stops it.', commands: checks }
      : { name: 'Checks of the repository', tone: '', text: 'This repository runs no check before a lane goes in.' },
  );

  if (review?.comments > 0) {
    rows.push({ name: 'Comments', tone: 'warn', text: `${count(review.comments, 'comment waits', 'comments wait')} for an answer or to be resolved.` });
  }
  return rows;
}

/** How many of them stop the lane, or will. */
export const stopping = (rows) => rows.filter((row) => row.tone === 'bad').length;
