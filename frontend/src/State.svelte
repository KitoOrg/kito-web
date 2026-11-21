<script>
  // Where a lane stands, in a few words: its state, and its review.
  let { lane } = $props();

  let said = $derived.by(() => {
    const review = lane.review ?? '';
    if (lane.state === 'awaiting_approval') {
      if (review.startsWith('approved')) return { text: `${review}, to integrate`, tone: 'ok' };
      return { text: review ? `waits: ${review}` : `waits for ${lane.proposed_by ? 'somebody who may integrate' : 'approval'}`, tone: 'warn' };
    }
    if (review.includes('changes requested')) return { text: review, tone: 'bad' };
    if (lane.conflicts?.length > 0) return { text: 'conflicts to decide', tone: 'bad' };
    if (lane.out_of_scope?.length > 0) return { text: 'changes outside its scope', tone: 'warn' };
    if (review) return { text: review, tone: review.startsWith('approved') ? 'ok' : '' };
    return { text: lane.state.replaceAll('_', ' '), tone: '' };
  });
</script>

<span class={`chip ${said.tone}`}>{said.text}</span>
