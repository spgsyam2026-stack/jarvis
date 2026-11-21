import React, { useState } from 'react';
import { Check, Copy, Monitor, X } from 'lucide-react';

interface Win11GuideModalProps {
  open: boolean;
  onClose: () => void;
}

const SNIPPETS = {
  localRun: `# 1. Install dependencies & configure optional server keys in .env
npm install
# Create .env from .env.example (optional if using UI Matrix keys)
npm run dev
# Opens at http://localhost:3000`,
  tauriBuild: `# 2. Package as a lightweight Windows 11 native app with Tauri v2 (~10 MB)
# Prerequisite: Rustup + Visual Studio C++ Build Tools (WebView2 is built into Win11)
npm install -D @tauri-apps/cli
npx tauri init --app-name "AETHER OS" --window-title "AETHER // OS" --frontend-dist ../dist --dev-url http://localhost:3000 --before-dev-command "npm run dev" --before-build-command "npm run build"
npm run tauri build
# Output installer & standalone .exe in src-tauri/target/release/`,
  electronBuild: `# 3. Alternative: Package with Electron Builder (portable .exe for personal machine)
npm install -D electron electron-builder concurrently wait-on
# Build production frontend & run locally without SmartScreen signing warnings:
npm run build
npx electron-builder --win portable --x64`,
  ollamaCors: `# 4. Enable local Ollama & microphone access on Windows 11
setx OLLAMA_ORIGINS "*"
ollama serve
# Tip: Pin http://localhost:3000 in Edge/Chrome via "Apps > Install this site as an app" for instant Win11 taskbar launch.`,
};

export const Win11GuideModal: React.FC<Win11GuideModalProps> = ({ open, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!open) return null;

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-xl border hud-hairline-cyan bg-[#0A0F1A] shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Windows 11 Build and Run Guide"
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b hud-hairline bg-[#070B14]">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-5 h-5 text-[#00F0FF]" />
            <div>
              <h2 className="text-lg font-display font-semibold text-white">Windows 11 Build & Run Guide</h2>
              <p className="text-xs text-slate-400">
                Run locally on Node.js, pin as a Windows 11 Edge/Chrome app, or compile with Tauri / Electron
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70"
            aria-label="Close guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-300">
          <div className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Local Development & Production Server</h3>
              <button
                type="button"
                onClick={() => copyText('localRun', SNIPPETS.localRun)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border hud-hairline hover:text-[#00F0FF]"
              >
                {copiedKey === 'localRun' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'localRun' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-3 rounded bg-[#0A0F1A] font-mono text-[11px] overflow-x-auto text-cyan-200">
              {SNIPPETS.localRun}
            </pre>
          </div>

          <div className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Tauri v2 Native Windows 11 Packaging</h3>
              <button
                type="button"
                onClick={() => copyText('tauriBuild', SNIPPETS.tauriBuild)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border hud-hairline hover:text-[#00F0FF]"
              >
                {copiedKey === 'tauriBuild' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'tauriBuild' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-slate-400">
              Built locally on your own Windows 11 machine, the compiled Tauri binary bypasses SmartScreen reputation checks since it originates on-device. WebView2 is preinstalled on Windows 11 and supports Web Speech & microphone capture.
            </p>
            <pre className="p-3 rounded bg-[#0A0F1A] font-mono text-[11px] overflow-x-auto text-cyan-200">
              {SNIPPETS.tauriBuild}
            </pre>
          </div>

          <div className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Electron Portable Executable (Alternative)</h3>
              <button
                type="button"
                onClick={() => copyText('electronBuild', SNIPPETS.electronBuild)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border hud-hairline hover:text-[#00F0FF]"
              >
                {copiedKey === 'electronBuild' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'electronBuild' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-3 rounded bg-[#0A0F1A] font-mono text-[11px] overflow-x-auto text-cyan-200">
              {SNIPPETS.electronBuild}
            </pre>
          </div>

          <div className="rounded-lg border hud-hairline bg-[#060912] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Local Ollama & Edge/Chrome App Pinning</h3>
              <button
                type="button"
                onClick={() => copyText('ollamaCors', SNIPPETS.ollamaCors)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border hud-hairline hover:text-[#00F0FF]"
              >
                {copiedKey === 'ollamaCors' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'ollamaCors' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-3 rounded bg-[#0A0F1A] font-mono text-[11px] overflow-x-auto text-cyan-200">
              {SNIPPETS.ollamaCors}
            </pre>
          </div>
        </div>

        <div className="px-5 py-3 border-t hud-hairline bg-[#070B14] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#00F0FF] text-[#05070C] hover:bg-cyan-300"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
