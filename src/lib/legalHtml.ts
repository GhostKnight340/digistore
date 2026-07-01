const allowedTags = new Set([
  "a",
  "blockquote",
  "br",
  "em",
  "h2",
  "h3",
  "h4",
  "hr",
  "li",
  "ol",
  "p",
  "strong",
  "u",
  "ul",
]);

const voidTags = new Set(["br", "hr"]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function safeHref(href: string) {
  const trimmed = href.trim();
  if (/^(https?:|mailto:|tel:|\/)/i.test(trimmed)) return trimmed;
  return "";
}

function normalizeTagName(tagName: string) {
  const lower = tagName.toLowerCase();
  if (lower === "b") return "strong";
  if (lower === "i") return "em";
  if (lower === "h1") return "h2";
  return lower;
}

function getAttribute(source: string, name: string) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`, "i");
  const match = pattern.exec(source);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function mergeAdjacentLists(html: string) {
  return html.replace(/<\/(ol|ul)>\s*<\1>/gi, "");
}

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function hasBlockContentBetweenLists(content: string) {
  return /<(?:p|h2|h3|h4|blockquote|hr)\b/i.test(content) || stripTags(content).length > 0;
}

function normalizeSingleItemSectionLists(html: string) {
  const singleItemOlPattern = /<ol(?:\s+start="(\d+)")?\s*>\s*<li>((?:(?!<\/li>|<ol\b|<ul\b)[\s\S])*)<\/li>\s*<\/ol>/gi;
  const matches = [...html.matchAll(singleItemOlPattern)];
  if (matches.length < 2) return html;

  const sectionLikeMatches = matches.filter((match, index) => {
    if (index === matches.length - 1) return true;
    const currentEnd = match.index! + match[0].length;
    const nextStart = matches[index + 1].index!;
    return hasBlockContentBetweenLists(html.slice(currentEnd, nextStart));
  });
  if (sectionLikeMatches.length < 2) return html;

  let sectionNumber = 1;
  return html.replace(singleItemOlPattern, (_match, start: string | undefined, item: string) => {
    const explicitStart = start ? Number.parseInt(start, 10) : NaN;
    const number = Number.isFinite(explicitStart) && explicitStart > 0 ? explicitStart : sectionNumber;
    sectionNumber = number + 1;
    const label = stripTags(item);
    if (/^\d+[.)]\s+/.test(label)) {
      return `<h2>${item}</h2>`;
    }
    return `<h2>${number}. ${item}</h2>`;
  });
}

export function looksLikeHtml(content: string) {
  return /<\/?(?:p|br|strong|b|em|i|u|a|ol|ul|li|h[1-6]|blockquote|hr)\b/i.test(content);
}

export function sanitizeLegalHtml(html: string) {
  const withoutComments = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  let result = "";
  let cursor = 0;
  const tagPattern = /<\/?[^>]+>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(withoutComments)) !== null) {
    result += escapeHtml(withoutComments.slice(cursor, match.index));
    const tag = match[0];
    const tagMatch = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(tag);

    if (tagMatch) {
      const closing = Boolean(tagMatch[1]);
      const tagName = normalizeTagName(tagMatch[2]);

      if (allowedTags.has(tagName)) {
        if (closing) {
          if (!voidTags.has(tagName)) result += `</${tagName}>`;
        } else if (tagName === "a") {
          const href = safeHref(getAttribute(tag, "href"));
          result += href
            ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer noopener">`
            : "<a>";
        } else if (tagName === "ol") {
          const start = Number.parseInt(getAttribute(tag, "start"), 10);
          result += Number.isFinite(start) && start > 1 ? `<ol start="${start}">` : "<ol>";
        } else {
          result += voidTags.has(tagName) ? `<${tagName}>` : `<${tagName}>`;
        }
      }
    }

    cursor = tagPattern.lastIndex;
  }

  result += escapeHtml(withoutComments.slice(cursor));
  return normalizeSingleItemSectionLists(mergeAdjacentLists(result))
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\s+<\/(li|p|h2|h3|h4)>/gi, "</$1>")
    .trim();
}

function renderInlineMarkdown(text: string) {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const safe = safeHref(href);
    return safe ? `<a href="${escapeAttribute(safe)}" target="_blank" rel="noreferrer noopener">${label}</a>` : label;
  });
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  escaped = escaped.replace(/<strong>(.*?)<\/strong>/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  escaped = escaped.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
  return escaped;
}

function lineIndent(line: string) {
  const match = /^(\s*)/.exec(line);
  return (match?.[1] ?? "").replaceAll("\t", "  ").length;
}

function renderMarkdownList(lines: string[]) {
  type StackEntry = { type: "ol" | "ul"; indent: number; liOpen: boolean };
  const stack: StackEntry[] = [];
  let html = "";

  function closeLi() {
    const top = stack.at(-1);
    if (top?.liOpen) {
      html += "</li>";
      top.liOpen = false;
    }
  }

  function closeList() {
    const top = stack.pop();
    if (!top) return;
    if (top.liOpen) html += "</li>";
    html += `</${top.type}>`;
  }

  for (const line of lines) {
    const ordered = /^(\s*)\d+[.)]\s+(.+)$/.exec(line);
    const unordered = /^(\s*)[-*]\s+(.+)$/.exec(line);
    const match = ordered ?? unordered;
    if (!match) continue;

    const type = ordered ? "ol" : "ul";
    const indent = lineIndent(match[1]);

    while (stack.length && indent < stack.at(-1)!.indent) closeList();
    if (!stack.length || indent > stack.at(-1)!.indent || type !== stack.at(-1)!.type) {
      if (stack.length && indent <= stack.at(-1)!.indent && type !== stack.at(-1)!.type) closeList();
      html += `<${type}>`;
      stack.push({ type, indent, liOpen: false });
    } else {
      closeLi();
    }

    html += `<li>${renderInlineMarkdown(match[2])}`;
    stack.at(-1)!.liOpen = true;
  }

  while (stack.length) closeList();
  return html;
}

function nextMeaningfulLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed) return { line: lines[index], trimmed };
  }
  return null;
}

function isTopLevelNumberedLine(line: string) {
  return /^\d+[.)]\s+(.+)$/.exec(line.trim());
}

function isNumberedSectionHeading(lines: string[], index: number) {
  const current = isTopLevelNumberedLine(lines[index]);
  if (!current) return null;

  const next = nextMeaningfulLine(lines, index + 1);
  if (!next) return current;

  const nextIsTopLevelNumbered = Boolean(isTopLevelNumberedLine(next.line));
  const nextIsAnyList = /^\s*(?:\d+[.)]|[-*])\s+/.test(next.line);
  const nextIsHeading = /^(#{1,3})\s+/.test(next.trimmed);

  return !nextIsTopLevelNumbered && !nextIsAnyList && !nextIsHeading ? current : null;
}

export function markdownLegalToHtml(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const numberedSectionHeading = isNumberedSectionHeading(lines, index);
    if (numberedSectionHeading) {
      blocks.push(`<h2>${renderInlineMarkdown(trimmed)}</h2>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${quoteLines.map(renderInlineMarkdown).join("<br>")}</blockquote>`);
      continue;
    }

    if (/^\s*(?:\d+[.)]|[-*])\s+/.test(line)) {
      const listLines: string[] = [];
      while (index < lines.length && /^\s*(?:\d+[.)]|[-*])\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderMarkdownList(listLines));
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (
        !currentTrimmed ||
        /^(?:-{3,}|\*{3,}|_{3,})$/.test(currentTrimmed) ||
        /^(#{1,3})\s+/.test(currentTrimmed) ||
        currentTrimmed.startsWith(">") ||
        /^\s*(?:\d+[.)]|[-*])\s+/.test(current)
      ) {
        break;
      }
      paragraph.push(currentTrimmed);
      index += 1;
    }
    blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
  }

  return sanitizeLegalHtml(blocks.join("\n"));
}

export function normalizeLegalHtml(content: string) {
  return looksLikeHtml(content) ? sanitizeLegalHtml(content) : markdownLegalToHtml(content);
}
