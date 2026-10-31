// CJK line breaks preserve whole Latin words and keep closing punctuation together.
export const chineseTokens = text => String(text).match(/[\u2e80-\u9fff\uf900-\ufaff][，。！？；：、）》】]*|[^\s\u2e80-\u9fff\uf900-\ufaff]+|\s+/gu) || [];
export function wrapChinese(text, measure, width) {
  const lines = []; let line = '';
  for (const token of chineseTokens(text)) {
    if (line && measure(line + token) > width) { lines.push(line.trimEnd()); line = ''; }
    if (measure(token) > width) {
      for (const ch of token) {
        if (line && measure(line + ch) > width) { lines.push(line); line = ''; }
        line += ch;
      }
    } else line += line ? token : token.trimStart();
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}
