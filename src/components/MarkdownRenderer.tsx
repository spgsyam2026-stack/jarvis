import React, { useMemo, useState } from 'react';
import { Check, Copy, Play, Table2, Code2, Terminal } from 'lucide-react';
import { parseCsvTable, runJsInWorkerSandbox, SandboxResult } from '../lib/sandbox';

interface MarkdownRendererProps {
  content: string;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function tryParseJsonArray(code: string): Array<Record<string, unknown>> | null {
  try {
    const parsed = JSON.parse(code);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      return parsed as Array<Record<string, unknown>>;
    }
    return null;
  } catch {
    return null;
  }
}

const CodeBlockViewer: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'table'>('code');
  const [running, setRunning] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<SandboxResult | null>(null);

  const lang = language.trim().toLowerCase();
  const isJs = lang === 'js' || lang === 'javascript';
  const csvTable = useMemo(() => (lang === 'csv' ? parseCsvTable(code) : null), [lang, code]);
  const jsonRows = useMemo(() => (lang === 'json' ? tryParseJsonArray(code) : null), [lang, code]);
  const hasTable = Boolean(csvTable || jsonRows);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRunSandbox = async () => {
    setRunning(true);
    const res = await runJsInWorkerSandbox(code);
    setSandboxResult(res);
    setRunning(false);
  };

  const jsonHeaders = useMemo(() => {
    if (!jsonRows) return [];
    const set = new Set<string>();
    for (const row of jsonRows.slice(0, 20)) {
      Object.keys(row).forEach((k) => set.add(k));
    }
    return Array.from(set);
  }, [jsonRows]);

  return (
    <div className="my-3 rounded-lg border hud-hairline bg-[#060911] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b hud-hairline bg-[#0B101D]">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
          {lang || 'text'}
        </span>
        <div className="flex items-center gap-1.5">
          {hasTable && (
            <button
              type="button"
              onClick={() => setViewMode((v) => (v === 'code' ? 'table' : 'code'))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/10 transition-colors whitespace-nowrap shrink-0"
            >
              {viewMode === 'code' ? <Table2 className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
              <span>{viewMode === 'code' ? 'Table View' : 'Raw View'}</span>
            </button>
          )}
          {isJs && (
            <button
              type="button"
              onClick={handleRunSandbox}
              disabled={running}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/10 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Play className="w-3 h-3" />
              <span>{running ? 'Running...' : 'Run Sandbox'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {viewMode === 'table' && csvTable ? (
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
            <thead className="bg-[#0D1424] text-slate-300 border-b hud-hairline">
              <tr>
                {csvTable.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {csvTable.rows.map((r, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/30">
                  {csvTable.headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap">
                      {r[cIdx] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'table' && jsonRows ? (
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
            <thead className="bg-[#0D1424] text-slate-300 border-b hud-hairline">
              <tr>
                {jsonHeaders.map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {jsonRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/30">
                  {jsonHeaders.map((h) => (
                    <td key={h} className="px-3 py-1.5 whitespace-nowrap">
                      {typeof row[h] === 'object' ? JSON.stringify(row[h]) : String(row[h] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="p-3 overflow-x-auto text-xs leading-relaxed font-mono text-slate-200">
          <code>{code}</code>
        </pre>
      )}

      {sandboxResult && (
        <div className="border-t hud-hairline bg-[#080D18] px-3 py-2 text-xs font-mono">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Worker Sandbox Output</span>
            </span>
            <span className={sandboxResult.ok ? 'text-emerald-400 tabular-nums' : 'text-rose-400 tabular-nums'}>
              {sandboxResult.ok ? `Completed · ${sandboxResult.durationMs}ms` : `Error · ${sandboxResult.durationMs}ms`}
            </span>
          </div>
          {sandboxResult.logs.length > 0 && (
            <div className="space-y-0.5 text-slate-300 whitespace-pre-wrap">
              {sandboxResult.logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
          {sandboxResult.returnValue && (
            <div className="mt-1 text-cyan-300 whitespace-pre-wrap">Return: {sandboxResult.returnValue}</div>
          )}
          {sandboxResult.error && <div className="mt-1 text-rose-400">{sandboxResult.error}</div>}
        </div>
      )}
    </div>
  );
};

function renderInlineFormatting(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-slate-800/80 text-cyan-300 font-mono text-[12px]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={key++} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(
        <em key={key++} className="italic text-slate-300">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) {
        tokens.push(
          <a
            key={key++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        tokens.push(token);
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const blocks = useMemo(() => {
    const result: Array<{ type: 'text' | 'code'; lang?: string; body: string }> = [];
    const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = fenceRegex.exec(content)) !== null) {
      if (m.index > last) {
        result.push({ type: 'text', body: content.slice(last, m.index) });
      }
      result.push({ type: 'code', lang: m[1] || 'text', body: m[2].replace(/\n$/, '') });
      last = fenceRegex.lastIndex;
    }
    if (last < content.length) {
      result.push({ type: 'text', body: content.slice(last) });
    }
    return result;
  }, [content]);

  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-200 break-words">
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return <CodeBlockViewer key={bIdx} language={block.lang || 'text'} code={block.body} />;
        }

        const lines = block.body.split('\n');
        return (
          <div key={bIdx} className="space-y-1.5">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1" />;

              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lIdx} className="text-sm font-semibold text-white pt-1 font-display">
                    {renderInlineFormatting(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lIdx} className="text-base font-semibold text-white pt-1.5 font-display">
                    {renderInlineFormatting(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith('# ')) {
                return (
                  <h2 key={lIdx} className="text-lg font-semibold text-white pt-1.5 font-display">
                    {renderInlineFormatting(trimmed.slice(2))}
                  </h2>
                );
              }
              if (trimmed.startsWith('> ')) {
                return (
                  <blockquote key={lIdx} className="pl-3 py-1 bg-slate-900/60 rounded text-slate-300 text-xs">
                    {renderInlineFormatting(trimmed.slice(2))}
                  </blockquote>
                );
              }
              if (/^[-*]\s+/.test(trimmed)) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="text-cyan-400 mt-1.5 text-[10px]" aria-hidden="true">
                      ◆
                    </span>
                    <div className="flex-1">{renderInlineFormatting(trimmed.replace(/^[-*]\s+/, ''))}</div>
                  </div>
                );
              }
              if (/^\d+\.\s+/.test(trimmed)) {
                const num = trimmed.match(/^(\d+)\.\s+/)?.[1];
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="text-cyan-400 font-mono text-xs tabular-nums mt-0.5">{num}.</span>
                    <div className="flex-1">{renderInlineFormatting(trimmed.replace(/^\d+\.\s+/, ''))}</div>
                  </div>
                );
              }

              return <p key={lIdx}>{renderInlineFormatting(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
};
