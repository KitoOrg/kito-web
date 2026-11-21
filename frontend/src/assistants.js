// How an assistant is drawn. Kito keeps the name each program said of
// itself (`claude-code`, `codex-mcp-client`) and has no list of them:
// this one is the client's, and a name it does not know is shown as it
// is. The marks are letters, not anybody's logo.

// How its name starts, what it is called, its letters, its colour.
const KNOWN = [
  ['claude-code', 'Claude Code', 'CC', 'amber'],
  ['claude', 'Claude', 'Cl', 'amber'],
  ['codex', 'Codex', 'Cx', 'green'],
  ['zcode', 'ZCode', 'Zc', 'violet'],
  ['gemini', 'Gemini CLI', 'Ge', 'blue'],
  ['cursor', 'Cursor', 'Cu', 'plain'],
  ['opencode', 'opencode', 'Oc', 'plain'],
  ['cline', 'Cline', 'Ci', 'plain'],
  ['windsurf', 'Windsurf', 'Ws', 'plain'],
  ['github-copilot', 'GitHub Copilot', 'Co', 'plain'],
  ['visual-studio-code', 'VS Code', 'VS', 'plain'],
];

/**
 * What to show for the `assistant` of a lane (`{ name, version, model }`):
 * `label`, `letters`, `colour`, and `title`, the whole of it in a line.
 */
export function assistantOf(assistant) {
  const name = assistant.name ?? '';
  const found = KNOWN.find(([start]) => name === start || name.startsWith(`${start}-`));
  const label = found?.[1] ?? name;
  const letters = found?.[2] ?? name.slice(0, 1).toUpperCase() + name.slice(1, 2);
  const version = assistant.version ? ` ${assistant.version}` : '';
  const model = assistant.model ? `, on ${assistant.model}` : '';
  return { label, letters, colour: found?.[3] ?? 'plain', title: `${label}${version}${model} (as it said of itself)` };
}
