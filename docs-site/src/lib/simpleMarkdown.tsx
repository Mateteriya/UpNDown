import type { ReactNode } from 'react';

/** Лёгкий рендер markdown для документов портала (без внешних зависимостей). */
export function SimpleMarkdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return <article className="doc-content">{blocks}</article>;
}

function parseBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(
        <pre key={key++} className="doc-pre" data-lang={lang || undefined}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)![0].length as 1 | 2 | 3;
      const Tag = (`h${Math.min(level, 3)}` as 'h1' | 'h2' | 'h3');
      out.push(
        <Tag key={key++} className={`doc-h${level}`}>
          {inline(line.replace(/^#+\s*/, ''))}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*] /, ''));
        i += 1;
      }
      out.push(
        <ul key={key++} className="doc-ul">
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i += 1;
      }
      out.push(
        <ol key={key++} className="doc-ol">
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^#{1,3} /.test(lines[i]) && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i]) && !lines[i].startsWith('```')) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={key++} className="doc-p">
        {inline(para.join(' '))}
      </p>,
    );
  }

  return out;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={k++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={k++} className="doc-code">{token.slice(1, -1)}</code>);
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (link) {
        parts.push(
          <a key={k++} href={link[2]} target="_blank" rel="noopener noreferrer">
            {link[1]}
          </a>,
        );
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}
