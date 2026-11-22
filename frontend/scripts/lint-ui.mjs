#!/usr/bin/env node
// The rules of the client's look that a program can check. It runs before
// every build, and a rule that is broken stops it: a page cannot drift from
// the others without somebody deciding it should.
//
//   node scripts/lint-ui.mjs              every file of src/
//   node scripts/lint-ui.mjs Lane.svelte  only these (names in src/)
//
// The rules are in UI.md; the one look is in src/app.css; how values and
// states are worded is in src/format.js and src/standing.js. Each rule
// below says what to use.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// ---- What a rule may be told to leave alone, and why.
// Text sizes a component may set itself (everything else comes from app.css).
const SIZES = ['12px', '13px', 'inherit'];
const SIZES_OF = {
  'App.svelte': ['15px', '0'], // the name beside the mark; hidden on a phone
  'Insights.svelte': ['20px'], // the big figures
  'Face.svelte': ['11px'], // an initial in a circle
  'Assistant.svelte': ['11px'], // two letters in a mark
};
const WEIGHTS = ['400', '500', '600', 'normal', 'inherit'];
const BREAKPOINTS = ['640', '900'];
const BREAKPOINTS_OF = { 'App.svelte': ['760'] }; // where the top bar folds
// The classes of app.css a component uses as they are, and never restyles.
const SHARED = new Set(
  `small soft faint none grow said rendered code plus minus wrap page-head lead section-title section-lead footnote
   narrow stack cols button check field hint fields controls filters form seg subtabs panel pad panel-head box setting
   kv rows row row-body row-title row-meta row-side table-wrap chip tag count ref ring sr error notice result mono
   primary quiet danger sm icon bare section-head panel-foot cards tight groups flush`.split(/\s+/),
);
// Where a `title` attribute is the thing itself: the moment behind "3 minutes ago", the name behind two letters.
const TITLE_OK = ['Time.svelte', 'Assistant.svelte'];
// Words the client does not use, and what it says instead.
const WORDS = [
  [/\badministrators?\b/i, 'say "admin"'],
  [/\bDeclared\b/, 'a lane has a "scope"'],
  [/\b(?:goes|go|went|gone) in\b/i, 'say "integrate" / "integrated"'],
  [/\bbrings? (?:it|them) in\b/i, 'say "integrate"'],
  [/\blands? on\b/i, 'say "into <lane>" or "integrate"'],
  [/\blet in\b/i, 'say "integrate" (or "has access")'],
  [/\bin step with\b/i, 'say "linked to"'],
  [/\bsuccessfully\b/i, 'say what is now true'],
];
const GLYPHS = /[✕✖✗✘×☰▾▴▸▹◂▼▲►◄←→↔↑↓✓✔☑⚠★☆]|\p{Extended_Pictographic}/u;

const asked = process.argv.slice(2);
const names = readdirSync(src)
  .filter((name) => /\.(svelte|js)$/.test(name))
  .filter((name) => asked.length === 0 || asked.includes(name))
  .sort();

const found = [];
const say = (file, text, at, rule, message) =>
  found.push({ file, line: text.slice(0, at).split('\n').length, rule, message: message === null ? null : message.replace(/\s+/g, ' ') });

const blank = (text) => text.replace(/[^\n]/g, ' ');

/** The three parts of a component, each as long as the file, with the others blanked: lines stay where they are. */
function split(name, text) {
  if (name.endsWith('.js')) return { markup: blank(text), script: text, style: blank(text) };
  const ranges = [];
  for (const [kind, tag] of [['script', 'script'], ['style', 'style']]) {
    for (const hit of text.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))) {
      const from = hit.index + hit[0].indexOf('>') + 1;
      ranges.push([kind, from, from + hit[1].length]);
    }
  }
  ranges.sort((a, b) => a[1] - b[1]);
  const part = (wanted) => {
    let [out, at] = ['', 0];
    for (const [kind, from, to] of ranges) {
      const between = text.slice(at, from);
      out += wanted === 'markup' ? between : blank(between);
      out += kind === wanted ? text.slice(from, to) : blank(text.slice(from, to));
      at = to;
    }
    const rest = text.slice(at);
    return out + (wanted === 'markup' ? rest : blank(rest));
  };
  return { markup: part('markup'), script: part('script'), style: part('style') };
}

/** Comments say what they like: they are blanked before anything is looked for. */
function uncomment({ markup, script, style }) {
  return {
    markup: markup.replace(/<!--[\s\S]*?-->/g, blank),
    script: script.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s;{}(),=])\/\/[^\n]*/gm, (all, before) => before + blank(all.slice(before.length))),
    style: style.replace(/\/\*[\s\S]*?\*\//g, blank),
  };
}

/** Each rule of a stylesheet that holds declarations: `[selector, declarations, where it starts]`. */
function* rules(style) {
  for (const hit of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = hit[1].trim();
    if (selector.startsWith('@')) continue;
    yield [selector, hit[2], hit.index + hit[1].length - hit[1].trimStart().length];
  }
}

const classesIn = (selector) => [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((hit) => hit[1]);

/** The classes the thing a selector styles carries: those of its last part. */
function subject(selector) {
  return selector.split(',').flatMap((one) => {
    const flat = one.replace(/:global\(([^)]*)\)/g, '$1').replace(/\[[^\]]*\]/g, '');
    const last = flat.trim().split(/\s*[>+~]\s*|\s+/).pop() ?? '';
    return classesIn(last.replace(/:(?:not|is|where|has)\([^)]*\)/g, ''));
  });
}

// What app.css defines: a class used in a page is one of these, or the page's own.
const appCss = readFileSync(join(src, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, blank);
const appClasses = new Set([...rules(appCss)].flatMap(([selector]) => classesIn(selector)));

/** The class names a tag is given: written out, by `class:name`, or as words inside `class={…}`. */
function* classesUsed(markup) {
  for (const hit of markup.matchAll(/\bclass:([A-Za-z_][\w-]*)/g)) yield [hit[1], hit.index];
  for (const hit of markup.matchAll(/\bclass=("|\{)/g)) {
    let [at, value] = [hit.index + hit[0].length, ''];
    if (hit[1] === '"') {
      value = markup.slice(at, markup.indexOf('"', at));
      // What is written out, and the words of what is worked out.
      const out = value.replace(/\{[^}]*\}/g, ' ');
      for (const word of out.split(/\s+/).filter(Boolean)) yield [word, hit.index];
      value = (value.match(/\{[^}]*\}/g) ?? []).join(' ');
    } else {
      let depth = 1;
      const from = at;
      while (at < markup.length && depth > 0) {
        if (markup[at] === '{') depth += 1;
        if (markup[at] === '}') depth -= 1;
        at += 1;
      }
      value = markup.slice(from, at - 1);
    }
    // Words that are compared with, or looked up, are not classes.
    const words = value
      .replace(/(?:===|!==|==|!=)\s*(['"`])[^'"`]*\1/g, ' ')
      .replace(/(['"`])[^'"`]*\1\s*(?:===|!==|==|!=)/g, ' ')
      .replace(/\.\w+\(\s*(['"`])[^'"`]*\1[^)]*\)/g, ' ')
      .replace(/\[\s*(['"`])[^'"`]*\1\s*\](?!\s*[,\]}]|$)/g, ' ');
    for (const quoted of words.matchAll(/(['"`])([^'"`]*)\1/g)) {
      for (const word of quoted[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean)) {
        // `hue-${n}`: the start of a name that is worked out is not a name.
        if (/^[A-Za-z_][\w-]*$/.test(word) && !word.endsWith('-')) yield [word, hit.index];
      }
    }
  }
}

for (const name of names) {
  const text = readFileSync(join(src, name), 'utf8');
  const svelte = name.endsWith('.svelte');
  const { markup, script, style } = uncomment(split(name, text));
  const tell = (at, rule, message) => say(name, text, at, rule, message);
  const each = (where, pattern, rule, message) => {
    for (const hit of where.matchAll(pattern)) tell(hit.index, rule, typeof message === 'function' ? message(hit) : message);
  };

  // ---- What is asked before something that cannot be undone, and how it is said.
  for (const where of [markup, script]) {
    each(where, /(?<![\w.$])(?:window\.)?(confirm|prompt|alert)\s*\(/g, 'native-dialog', (hit) => `${hit[1]}(): use <Confirm>, a field of the page, or toast()`);
  }

  // ---- Words.
  for (const where of [markup, script]) {
    for (const [pattern, instead] of WORDS) {
      each(where, new RegExp(pattern.source, `${pattern.flags}g`), 'words', (hit) => `"${hit[0]}": ${instead}`);
    }
    each(where, /[A-Za-z]\\?'(?:s|t|re|ve|ll|d|m)\b(?!')/g, 'apostrophe', (hit) => `"${hit[0]}": the typographic apostrophe ’ in what is shown`);
    each(where, new RegExp(GLYPHS.source, 'gu'), 'glyph', (hit) => `"${hit[0]}": <Icon name="…"> for a picture, words for the rest`);
  }

  // ---- Values: written by format.js, shown by <Time>.
  if (!['format.js', 'Time.svelte'].includes(name)) {
    for (const where of [markup, script]) {
      each(where, /\.toLocale(?:Date|Time)?String\(|\bIntl\./g, 'date', 'dates are written by format.js: <Time ms>, day(ms), exact(ms)');
      if (name !== 'api.js') each(where, /(?<![\w.])ago\(/g, 'date', 'a time is shown with <Time ms={…} />');
      each(where, /1\s*\?\s*''\s*:\s*'s'|1\s*\?\s*'s'\s*:\s*''|1\s*\?\s*'(\w[\w ]*)'\s*:\s*'\1s'/g, 'plural', 'count(n, "lane") from format.js');
      each(
        where,
        /\bconst\s+(count|ago|size|plural|humanize|laneName|span|exact|day)\s*=\s*(?:\([^)]*\)|\w+)\s*=>|\bfunction\s+(count|ago|size|plural|humanize|laneName|span|exact|day)\s*\(/g,
        'copy',
        (hit) => `${hit[1] ?? hit[2]}: import it from format.js`,
      );
    }
  }

  if (!svelte) continue;

  // ---- Markup.
  if (name !== 'PageHead.svelte') each(markup, /<h1\b/g, 'heading', 'the title of a page is <PageHead title>');
  each(markup, /<h[56]\b/g, 'heading', 'h2.section-title, h3 (a card), h4 (a group): nothing deeper');
  if (name !== 'Err.svelte') each(markup, /\bclass="[^"]*\berror\b[^"]*"/g, 'error', 'an error is <Err message={…} />, under what caused it');
  each(markup, /\sstyle="/g, 'inline-style', 'a class of app.css, or a style:property directive for a value that is worked out');
  if (!TITLE_OK.includes(name)) each(markup, /<[a-z][\w-]*\b[^>]*?\stitle=/g, 'title', 'nothing is said only in a title attribute: say it on the page (.hint)');
  each(markup, /<button\b[^>]*\bclass="[^"]*\bsmall\b/g, 'button', 'a small button is .sm');
  each(markup, /<button\b[^>]*>\s*Close\s*<\/button>/g, 'button', 'hiding a panel is an icon button (aria-label="Close", <Icon name="close">); "Cancel" leaves a form');
  each(markup, /<button\b[^>]*>\s*\+\s*<\/button>/g, 'glyph', '<Icon name="plus" /> with an aria-label');
  each(markup, /<(?:button|a)\b[^>]*>[^<{}]*…[^<{}]*<\/(?:button|a)>/g, 'ellipsis', 'an ellipsis is only for a busy label ("Saving…")');
  // A chip is a state: a few lower-case words, written out or worded by standing.js through <State>.
  each(markup, /<a\b[^>]*?\bclass=(?:"[^"]*\bchip\b[^"]*"|\{[^>]*?\bchip\b)/g, 'chip', 'a link is a link (.ref for a lane, a task, a file), not a chip');
  if (name !== 'State.svelte') {
    for (const hit of markup.matchAll(/<(span|b|em|p|div)\b[^>]*?\bclass=(?:"[^"]*(?<![\w-])chip(?![\w-])[^"]*"|\{[^>]*?(?<![\w-])chip(?![\w-])[^>]*?\})[^>]*>([\s\S]*?)<\/\1>/g)) {
      const said = hit[2].trim();
      if (/[{<]/.test(said)) tell(hit.index, 'chip', 'a chip is a state, worded by standing.js: <State said={…} /> (or lane=, task=); a count is .count, a kind .tag, a link a link');
      else if (said.split(/\s+/).length > 3 || /[A-Z.:]/.test(said)) tell(hit.index, 'chip', `"${said}": a chip is a state in at most three lower-case words`);
    }
  }
  for (const [word, at] of classesUsed(markup)) {
    const own = new Set([...rules(style)].flatMap(([selector]) => classesIn(selector)));
    if (!appClasses.has(word) && !own.has(word)) tell(at, 'class', `.${word} is neither in app.css nor styled here`);
  }

  // ---- The component's own style: only the layout that is its own.
  const sizes = [...SIZES, ...(SIZES_OF[name] ?? [])];
  const breakpoints = [...BREAKPOINTS, ...(BREAKPOINTS_OF[name] ?? [])];
  each(style, /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g, 'colour', 'a colour is a token of app.css (var(--…), color-mix of tokens)');
  each(script, /(['"`])#[0-9a-fA-F]{3,8}\1|\b(?:rgba?|hsla?)\(/g, 'colour', 'a colour is read from a token of app.css');
  each(style, /(?<![\w-])font-size\s*:\s*([^;}]+)/g, 'type', (hit) => (sizes.includes(hit[1].trim()) ? null : `font-size ${hit[1].trim()}: sizes come from app.css (.small 12, text 13, .said/.rendered 14, h2 15, h1 20)`));
  each(style, /(?<![\w-])font\s*:\s*([^;}]+)/g, 'type', (hit) => {
    const size = /(\d+(?:\.\d+)?px)/.exec(hit[1])?.[1];
    const weight = /\b([1-9]00|bold)\b/.exec(hit[1])?.[1];
    if (size && !sizes.includes(size)) return `font ${hit[1].trim()}: sizes come from app.css`;
    if (weight && !WEIGHTS.includes(weight)) return `font ${hit[1].trim()}: weights are 400, 500, 600`;
    return null;
  });
  each(style, /(?<![\w-])font-weight\s*:\s*([^;}]+)/g, 'type', (hit) => (WEIGHTS.includes(hit[1].trim()) ? null : `font-weight ${hit[1].trim()}: 400 text, 500 controls and labels, 600 titles`));
  each(style, /@media[^{]*?\((?:max|min)-width\s*:\s*(\d+)px\)/g, 'breakpoint', (hit) => (breakpoints.includes(hit[1]) ? null : `${hit[1]}px: the breakpoints are 640 (phone) and 900 (columns stack)`));
  each(style, /(?<![\w(-])max-width\s*:\s*(\d+)px/g, 'width', (hit) => (Number(hit[1]) < 600 ? null : `max-width ${hit[1]}px: .narrow (forms, settings), .lead (text); pages use the whole container`));
  each(style, /(?<![\w-])border-radius\s*:\s*([^;}]+)/g, 'radius', (hit) => (/\b(?!999px)\d+px/.test(hit[1]) ? `border-radius ${hit[1].trim()}: var(--radius), var(--radius-panel), 50% or 999px` : null));
  for (const [selector, body, at] of rules(style)) {
    if (/(?<![\w.#-])h[1-4](?![\w-])/.test(selector) && /(?<![\w-])(?:font|font-size|font-weight|letter-spacing|text-transform)\s*:/.test(body)) {
      tell(at, 'heading', `${selector}: headings are styled by app.css, by what they head`);
    }
    const restyled = subject(selector).filter((one) => SHARED.has(one));
    if (restyled.length > 0) tell(at, 'restyle', `${selector}: .${restyled[0]} is shared (app.css); give the thing a class of its own for what is unique here`);
  }

  // ---- What the compiler sees: a style nothing uses, a thing whoever does not see the page cannot use.
  try {
    const { warnings } = compile(text, { filename: name, generate: false });
    for (const warning of warnings) {
      if (warning.code === 'css_unused_selector' || warning.code.startsWith('a11y')) {
        found.push({ file: name, line: warning.start?.line ?? 1, rule: warning.code, message: warning.message.split('\n')[0] });
      }
    }
  } catch (error) {
    found.push({ file: name, line: error.start?.line ?? 1, rule: 'compile', message: error.message.split('\n')[0] });
  }
}

const real = found.filter((one) => one.message !== null);
real.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
for (const one of real) console.log(`${one.file}:${one.line}  [${one.rule}]  ${one.message}`);
if (real.length > 0) {
  const files = new Set(real.map((one) => one.file)).size;
  console.error(`\nlint-ui: ${real.length} to fix in ${files} ${files === 1 ? 'file' : 'files'} (the rules: UI.md)`);
  process.exit(1);
}
console.log(`lint-ui: ${names.length} files follow the rules`);
