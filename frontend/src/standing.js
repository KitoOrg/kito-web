// Where a lane stands, in a few words and a tone: its state, and its
// review. Said the same way wherever a lane is shown.

/** The approvals a lane still lacks ("0 of 1 approval": 1); 0 when it needs none, or has them. */
export function lacking(lane) {
  const said = /^(\d+) of (\d+) approval/.exec(lane.review ?? '');
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

/** `{ text, tone }`: tone is `ok`, `warn`, `bad`, `done` or nothing (open, and nothing to say of it). */
export function standing(lane) {
  const review = lane.review ?? '';
  if (lane.state === 'closed') return { text: 'closed', tone: 'done' };
  if (lane.state === 'awaiting_approval') {
    if (review.startsWith('approved')) return { text: `${review}, to integrate`, tone: 'ok' };
    return { text: review ? `waits: ${review}` : `waits for ${lane.proposed_by ? 'somebody who may integrate' : 'approval'}`, tone: 'warn' };
  }
  if (review.includes('changes requested')) return { text: review, tone: 'bad' };
  if (lane.conflicts?.length > 0) return { text: 'conflicts to decide', tone: 'bad' };
  if (lane.out_of_scope?.length > 0) return { text: 'changes outside its scope', tone: 'warn' };
  if (review) return { text: review, tone: review.startsWith('approved') ? 'ok' : lacking(lane) > 0 ? 'warn' : '' };
  return { text: lane.state.replaceAll('_', ' '), tone: '' };
}
