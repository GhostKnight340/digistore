import React from "react";

type LegalContentProps = {
  content: string;
};

type InlineNode = string | React.ReactElement;

function isDivider(line: string) {
  return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function safeHref(href: string) {
  const trimmed = href.trim();
  if (/^(https?:|mailto:|tel:|\/)/i.test(trimmed)) return trimmed;
  return "#";
}

function renderInline(text: string, keyPrefix: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|<u>(.*?)<\/u>|\*([^*]+)\*)/gi;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-${index++}`;

    if (match[2] && match[3]) {
      const href = safeHref(match[3]);
      const external = /^https?:\/\//i.test(href);
      nodes.push(
        <a
          key={key}
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:text-accent-hover"
        >
          {renderInline(match[2], `${key}-link`)}
        </a>,
      );
    } else if (match[4]) {
      nodes.push(<strong key={key}>{renderInline(match[4], `${key}-strong`)}</strong>);
    } else if (match[5]) {
      nodes.push(<u key={key}>{renderInline(match[5], `${key}-underline`)}</u>);
    } else if (match[6]) {
      nodes.push(<u key={key}>{renderInline(match[6], `${key}-underline-html`)}</u>);
    } else if (match[7]) {
      nodes.push(<em key={key}>{renderInline(match[7], `${key}-em`)}</em>);
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function paragraphLines(lines: string[], blockIndex: number) {
  return lines.map((line, index) => (
    <React.Fragment key={`p-${blockIndex}-${index}`}>
      {index > 0 ? <br /> : null}
      {renderInline(line, `p-${blockIndex}-${index}`)}
    </React.Fragment>
  ));
}

export default function LegalContent({ content }: LegalContentProps) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactElement[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    const blockKey = blocks.length;

    if (isDivider(line)) {
      blocks.push(<hr key={`hr-${blockKey}`} />);
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const children = renderInline(heading[2], `h-${blockKey}`);
      if (level === 1) blocks.push(<h2 key={`h1-${blockKey}`}>{children}</h2>);
      else if (level === 2) blocks.push(<h3 key={`h2-${blockKey}`}>{children}</h3>);
      else blocks.push(<h4 key={`h3-${blockKey}`}>{children}</h4>);
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${blockKey}`}>
          {paragraphLines(quoteLines, blockKey)}
        </blockquote>,
      );
      continue;
    }

    const unordered = /^\s*[-*]\s+(.+)$/.exec(rawLine);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(rawLine);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = orderedList
          ? /^\s*\d+[.)]\s+(.+)$/.exec(lines[index])
          : /^\s*[-*]\s+(.+)$/.exec(lines[index]);
        if (!candidate) break;
        items.push(candidate[1]);
        index += 1;
      }
      const ListTag = orderedList ? "ol" : "ul";
      blocks.push(
        <ListTag key={`list-${blockKey}`}>
          {items.map((item, itemIndex) => (
            <li key={`list-${blockKey}-${itemIndex}`}>
              {renderInline(item, `li-${blockKey}-${itemIndex}`)}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const trimmed = current.trim();
      if (
        !trimmed ||
        isDivider(trimmed) ||
        /^(#{1,3})\s+/.test(trimmed) ||
        trimmed.startsWith(">") ||
        /^\s*[-*]\s+/.test(current) ||
        /^\s*\d+[.)]\s+/.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    blocks.push(<p key={`p-${blockKey}`}>{paragraphLines(paragraph, blockKey)}</p>);
  }

  return <div className="legal-content">{blocks}</div>;
}
