export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function splitMessage(text: string, max = 3900): string[] {
  const result: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < Math.floor(max / 2)) cut = max;
    result.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) result.push(rest);
  return result.length ? result : ['(sin contenido)'];
}


/** Convert a small, safe subset of LLM Markdown into Telegram HTML. */
export function renderAssistantText(input: string): string {
  const tokens: string[] = [];
  // Escape all generated content first; restore only markup we explicitly create.
  const source = escapeHtml(input).replace(/\r\n/g, '\n');
  const renderInline = (value: string): string => {
    const stash = (html: string): string => { const key = `\uE000${tokens.length}\uE001`; tokens.push(html); return key; };
    let text = value.replace(/`([^`\n]+)`/g, (_whole, code: string) => stash(`<code>${code}</code>`));
    text = text.replace(/\*\*([^*\n]+)\*\*/g, (_whole, content: string) => stash(`<b>${content}</b>`));
    text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_whole, content: string) => stash(`<i>${content}</i>`));
    return text.replace(/\uE000(\d+)\uE001/g, (_whole, index: string) => tokens[Number(index)] ?? '');
  };
  return source.split('\n').map(line => {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) return `<b>${renderInline(heading[1] ?? '')}</b>`;
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) return `• ${renderInline(bullet[1] ?? '')}`;
    return renderInline(line);
  }).join('\n');
}
