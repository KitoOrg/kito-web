// A small markdown renderer for instructions: headings, paragraphs, lists,
// fenced and inline code, bold and italics. Everything is escaped first,
// so no text of an instruction becomes markup of its own.

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

/** The HTML of a markdown text, safe to put in a page. */
export function markdown(text) {
  const out = [];
  let list = null;
  let paragraph = [];
  let fence = null;
  const flush = () => {
    if (paragraph.length > 0) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of (text ?? '').split('\n')) {
    if (fence !== null) {
      if (line.trim().startsWith('```')) {
        out.push(`<pre><code>${escape(fence.join('\n'))}</code></pre>`);
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }
    if (line.trim().startsWith('```')) {
      flush();
      fence = [];
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (paragraph.length > 0) {
        out.push(`<p>${inline(paragraph.join(' '))}</p>`);
        paragraph = [];
      }
      if (list !== kind) {
        if (list) out.push(`</${list}>`);
        // A numbered list that goes on after something else keeps its numbers.
        const start = numbered && numbered[1] !== '1' ? ` start="${Number(numbered[1])}"` : '';
        out.push(`<${kind}${start}>`);
        list = kind;
      }
      out.push(`<li>${inline(bullet ? bullet[1] : numbered[2])}</li>`);
    } else if (line.trim() === '') {
      flush();
    } else if (list && /^\s{2,}/.test(line)) {
      // The rest of a list item, on a line of its own.
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
    } else {
      if (list) {
        out.push(`</${list}>`);
        list = null;
      }
      paragraph.push(line.trim());
    }
  }
  if (fence !== null) out.push(`<pre><code>${escape(fence.join('\n'))}</code></pre>`);
  flush();
  return out.join('\n');
}
