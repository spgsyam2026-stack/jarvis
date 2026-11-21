export interface SandboxResult {
  ok: boolean;
  logs: string[];
  returnValue: string;
  durationMs: number;
  error?: string;
}

/**
 * Runs JavaScript in an isolated Web Worker with a strict execution timeout.
 * No access to DOM, window, document, or localStorage.
 */
export function runJsInWorkerSandbox(code: string, timeoutMs = 2500): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const workerSource = `
      "use strict";
      self.onmessage = async (event) => {
        const logs = [];
        const formatVal = (v) => {
          if (typeof v === 'string') return v;
          try { return JSON.stringify(v, null, 2); } catch { return String(v); }
        };
        const sandboxConsole = {
          log: (...args) => logs.push(args.map(formatVal).join(' ')),
          info: (...args) => logs.push(args.map(formatVal).join(' ')),
          warn: (...args) => logs.push('[WARN] ' + args.map(formatVal).join(' ')),
          error: (...args) => logs.push('[ERR] ' + args.map(formatVal).join(' ')),
        };
        try {
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const fn = new AsyncFunction('console', 'fetch', 'XMLHttpRequest', 'WebSocket', event.data.code);
          const result = await fn(sandboxConsole, undefined, undefined, undefined);
          self.postMessage({
            ok: true,
            logs,
            returnValue: result === undefined ? '' : formatVal(result),
          });
        } catch (err) {
          self.postMessage({
            ok: false,
            logs,
            returnValue: '',
            error: err && err.message ? err.message : String(err),
          });
        }
      };
    `;

    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        ok: false,
        logs: [],
        returnValue: '',
        durationMs: Math.round(performance.now() - start),
        error: `Execution timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        ok: Boolean(e.data.ok),
        logs: Array.isArray(e.data.logs) ? e.data.logs : [],
        returnValue: String(e.data.returnValue || ''),
        durationMs: Math.round(performance.now() - start),
        error: e.data.error,
      });
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        ok: false,
        logs: [],
        returnValue: '',
        durationMs: Math.round(performance.now() - start),
        error: err.message || 'Worker execution error',
      });
    };

    worker.postMessage({ code });
  });
}

export function parseCsvTable(csvText: string): { headers: string[]; rows: string[][] } | null {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(lines[0]);
  if (headers.length < 2) return null;
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}
