// What the pages and the shell around them tell each other.
//
// `repo`: the repository the client is looking at, for the head of each
// page. `foot`: how tall what is stuck to the foot of the window is (a
// lane's review bar), so that what is said for a moment stands over it.
// `stale`: counts what changed who is signed in or what they may use.
export const shell = $state({ repo: null, foot: 0, stale: 0 });

/** A repository was added or renamed, a plugin enabled: the shell asks again who is signed in and what they may use. */
export function refresh() {
  shell.stale += 1;
}
