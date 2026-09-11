export type MessageTextPart = {
  text: string;
  action: boolean;
  highlighted: boolean;
};

export function messageTextParts(text: string, query = ""): MessageTextPart[] {
  const parts: MessageTextPart[] = [];
  const matchStart = query.trim()
    ? text.toLocaleLowerCase("ru").indexOf(query.toLocaleLowerCase("ru"))
    : -1;
  const matchEnd = matchStart + query.length;
  function append(start: number, end: number, action: boolean) {
    const boundaries = [start, end];
    if (matchStart > start && matchStart < end) boundaries.push(matchStart);
    if (matchEnd > start && matchEnd < end) boundaries.push(matchEnd);
    boundaries.sort((a, b) => a - b);
    for (let index = 0; index < boundaries.length - 1; index++) {
      const from = boundaries[index];
      const to = boundaries[index + 1];
      if (from === to) continue;
      parts.push({
        text: text.slice(from, to),
        action,
        highlighted: matchStart >= 0 && from >= matchStart && to <= matchEnd,
      });
    }
  }
  let cursor = 0;
  for (const match of text.matchAll(/(?<!\*)\*([^*]+)\*(?!\*)/g)) {
    if (!match[1].trim()) continue;
    append(cursor, match.index, false);
    append(match.index + 1, match.index + match[0].length - 1, true);
    cursor = match.index + match[0].length;
  }
  append(cursor, text.length, false);
  return parts;
}
