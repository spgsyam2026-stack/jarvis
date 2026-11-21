import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  Workflow,
} from 'lucide-react';
import { ConversationThread, PersonaPreset, WorkflowMacro } from '../types';

interface LeftSidebarProps {
  threads: ConversationThread[];
  activeThreadId: string;
  onSelectThread: (id: string) => void;
  onCreateThread: (workspace?: string) => void;
  onDeleteThread: (id: string) => void;
  personas: PersonaPreset[];
  activePersonaId: string;
  onSelectPersona: (id: string) => void;
  onUpdatePersonaInstruction: (id: string, systemInstruction: string) => void;
  macros: WorkflowMacro[];
  onRunMacro: (macro: WorkflowMacro) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  personas,
  activePersonaId,
  onSelectPersona,
  onUpdatePersonaInstruction,
  macros,
  onRunMacro,
  onExportJson,
  onImportJson,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPersona, setEditingPersona] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePersona = personas.find((p) => p.id === activePersonaId) || personas[0];

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.workspace.toLowerCase().includes(q) ||
        t.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [threads, searchQuery]);

  return (
    <aside className="w-[260px] shrink-0 border-r hud-hairline bg-[#070B14] flex flex-col h-full overflow-hidden">
      {/* Threads Header + New Thread */}
      <div className="p-3 border-b hud-hairline space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-display font-semibold text-slate-200">Workspaces & Threads</span>
          <button
            type="button"
            onClick={() => onCreateThread()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/25 hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search history..."
            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#00F0FF]/40"
          />
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredThreads.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-500">No matching threads</div>
        ) : (
          filteredThreads.map((t) => {
            const active = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-500/12 text-white border border-[#00F0FF]/25'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
                onClick={() => onSelectThread(t.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#00F0FF]' : 'text-slate-500'}`} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {t.workspace} · {t.messages.length} msgs
                    </div>
                  </div>
                </div>
                {threads.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteThread(t.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-rose-400 transition-opacity"
                    aria-label={`Delete ${t.title}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Persona Selector */}
      <div className="border-t hud-hairline p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <UserCheck className="w-3.5 h-3.5 text-violet-400" />
            <span>Agent Persona</span>
          </span>
          <button
            type="button"
            onClick={() => setEditingPersona((v) => !v)}
            className="text-[11px] text-slate-400 hover:text-[#00F0FF] inline-flex items-center gap-1"
          >
            <Edit3 className="w-3 h-3" />
            <span>{editingPersona ? 'Close' : 'Prompt'}</span>
          </button>
        </div>

        <select
          value={activePersona.id}
          onChange={(e) => onSelectPersona(e.target.value)}
          aria-label="Select Agent Persona"
          className="w-full px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A] text-xs text-slate-200 focus:outline-none focus:border-[#00F0FF]/40"
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.role}
            </option>
          ))}
        </select>

        {editingPersona && (
          <textarea
            value={activePersona.systemInstruction}
            onChange={(e) => onUpdatePersonaInstruction(activePersona.id, e.target.value)}
            rows={4}
            aria-label="Edit Persona System Instruction"
            className="w-full p-2 rounded-lg border hud-hairline bg-[#05070C] text-[11px] text-slate-300 focus:outline-none focus:border-[#00F0FF]/40 resize-none"
          />
        )}
      </div>

      {/* Quick Macros */}
      <div className="border-t hud-hairline p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1">
          <Workflow className="w-3.5 h-3.5 text-cyan-400" />
          <span>Quick Macros</span>
        </div>
        {macros.slice(0, 3).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onRunMacro(m)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border hud-hairline bg-[#0A0F1A]/80 hover:border-cyan-400/40 text-left text-xs text-slate-300 hover:text-white transition-colors"
          >
            <span className="truncate">{m.name}</span>
            <span className="font-mono text-[10px] text-cyan-400 shrink-0 ml-2">/{m.command}</span>
          </button>
        ))}
      </div>

      {/* Export / Import */}
      <div className="border-t hud-hairline p-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onExportJson}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border hud-hairline text-xs text-slate-300 hover:text-white hover:border-cyan-400/40 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border hud-hairline text-xs text-slate-300 hover:text-white hover:border-cyan-400/40 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Import</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportJson(f);
            e.target.value = '';
          }}
        />
      </div>
    </aside>
  );
};
