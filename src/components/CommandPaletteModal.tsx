import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookMarked,
  CheckSquare,
  Command,
  Cpu,
  Layers,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Plus,
  Search,
  Terminal,
  Workflow,
  X,
} from 'lucide-react';
import {
  ConversationThread,
  MissionItem,
  PersonaPreset,
  VaultNote,
  WorkflowMacro,
} from '../types';

export type PaletteCategoryFilter = 'all' | 'chats' | 'vault' | 'missions' | 'commands';

export interface PaletteAction {
  id: string;
  label: string;
  sublabel?: string;
  snippet?: string;
  category: string;
  filterGroup: Exclude<PaletteCategoryFilter, 'all'>;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  threads: ConversationThread[];
  notes: VaultNote[];
  missions: MissionItem[];
  personas: PersonaPreset[];
  macros: WorkflowMacro[];
  onSelectThread: (id: string) => void;
  onJumpToMessage: (threadId: string, messageId: string) => void;
  onOpenVault: () => void;
  onOpenMissions: () => void;
  onSelectPersona: (id: string) => void;
  onRunMacro: (macro: WorkflowMacro) => void;
  onCreateThread: () => void;
  onOpenApiMatrix: () => void;
  onOpenWin11Guide: () => void;
  onToggleCompactHud: () => void;
  onToggleMic: () => void;
  onToggleMicMute?: () => void;
  onExportJson: () => void;
}

function buildCenteredSnippet(text: string, query: string, maxLen = 110): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const lower = clean.toLowerCase();
  const qLower = query.trim().toLowerCase();
  const idx = qLower ? lower.indexOf(qLower) : -1;
  if (idx === -1) {
    return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
  }
  const half = Math.floor((maxLen - qLower.length) / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(clean.length, start + maxLen);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  return `${prefix}${clean.slice(start, end)}${suffix}`;
}

function renderHighlightedText(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const matchIdx = lowerText.indexOf(lowerQ, cursor);
    if (matchIdx === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (matchIdx > cursor) {
      parts.push(text.slice(cursor, matchIdx));
    }
    parts.push(
      <mark
        key={`${matchIdx}-${cursor}`}
        className="bg-cyan-500/25 text-[#00F0FF] rounded px-0.5 font-medium"
      >
        {text.slice(matchIdx, matchIdx + q.length)}
      </mark>,
    );
    cursor = matchIdx + q.length;
  }

  return parts;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  onClose,
  threads,
  notes,
  missions,
  personas,
  macros,
  onSelectThread,
  onJumpToMessage,
  onOpenVault,
  onOpenMissions,
  onSelectPersona,
  onRunMacro,
  onCreateThread,
  onOpenApiMatrix,
  onOpenWin11Guide,
  onToggleCompactHud,
  onToggleMic,
  onToggleMicMute,
  onExportJson,
}) => {
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<PaletteCategoryFilter>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setScopeFilter('all');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const commandActions: PaletteAction[] = useMemo(() => {
    const base: PaletteAction[] = [
      {
        id: 'act-new-thread',
        label: 'New Workspace Thread',
        category: 'Workspace',
        filterGroup: 'commands',
        icon: Plus,
        run: onCreateThread,
      },
      {
        id: 'act-api-matrix',
        label: 'Open API & Model Matrix',
        category: 'System',
        filterGroup: 'commands',
        icon: Cpu,
        run: onOpenApiMatrix,
      },
      {
        id: 'act-toggle-mic',
        label: 'Toggle Voice Microphone',
        category: 'Voice',
        filterGroup: 'commands',
        shortcut: 'Ctrl+M',
        icon: Mic,
        run: onToggleMic,
      },
      ...(onToggleMicMute
        ? [
            {
              id: 'act-toggle-mic-mute',
              label: 'Toggle Global Microphone Mute',
              category: 'Voice',
              filterGroup: 'commands' as const,
              shortcut: 'Ctrl+Shift+M',
              icon: MicOff,
              run: onToggleMicMute,
            },
          ]
        : []),
      {
        id: 'act-compact-hud',
        label: 'Toggle Compact HUD Mode',
        category: 'Layout',
        filterGroup: 'commands',
        shortcut: 'Ctrl+Shift+H',
        icon: Layers,
        run: onToggleCompactHud,
      },
      {
        id: 'act-win11',
        label: 'Windows 11 Build & Tauri/Electron Guide',
        category: 'System',
        filterGroup: 'commands',
        icon: Monitor,
        run: onOpenWin11Guide,
      },
      {
        id: 'act-export',
        label: 'Export Workspace & State JSON',
        category: 'Data',
        filterGroup: 'commands',
        icon: Terminal,
        run: onExportJson,
      },
    ];

    for (const p of personas) {
      base.push({
        id: `persona-${p.id}`,
        label: `Switch Persona: ${p.name} (${p.role})`,
        category: 'Persona',
        filterGroup: 'commands',
        icon: Command,
        run: () => onSelectPersona(p.id),
      });
    }

    for (const m of macros) {
      base.push({
        id: `macro-${m.id}`,
        label: `Run Macro /macro ${m.command} — ${m.name}`,
        category: 'Macro',
        filterGroup: 'commands',
        icon: Workflow,
        run: () => onRunMacro(m),
      });
    }

    for (const t of threads) {
      base.push({
        id: `thread-${t.id}`,
        label: `Jump to Thread: ${t.title}`,
        category: 'Thread',
        filterGroup: 'chats',
        icon: MessageSquare,
        run: () => onSelectThread(t.id),
      });
    }

    return base;
  }, [
    threads,
    personas,
    macros,
    onCreateThread,
    onOpenApiMatrix,
    onToggleMic,
    onToggleCompactHud,
    onOpenWin11Guide,
    onExportJson,
    onSelectPersona,
    onRunMacro,
    onSelectThread,
  ]);

  const { results, counts } = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      const initial =
        scopeFilter === 'all'
          ? commandActions.slice(0, 14)
          : commandActions.filter((a) => a.filterGroup === scopeFilter);

      return {
        results: initial,
        counts: {
          all: commandActions.length,
          chats: threads.length,
          vault: notes.length,
          missions: missions.length,
          commands: commandActions.filter((a) => a.filterGroup === 'commands').length,
        },
      };
    }

    const matchedCommands = commandActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q),
    );

    const matchedChats: PaletteAction[] = [];
    for (const thread of threads) {
      for (let i = thread.messages.length - 1; i >= 0; i--) {
        const msg = thread.messages[i];
        const attText = (msg.attachments || []).map((a) => a.name).join(' ');
        const fullText = `${msg.content} ${attText}`;
        if (fullText.toLowerCase().includes(q)) {
          const speaker = msg.role === 'user' ? 'You' : 'AETHER';
          matchedChats.push({
            id: `chat-${thread.id}-${msg.id}`,
            label: `${speaker} in ${thread.title}`,
            sublabel: new Date(msg.timestamp).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            }),
            snippet: buildCenteredSnippet(msg.content || attText, query),
            category: 'Chat',
            filterGroup: 'chats',
            icon: MessageSquare,
            run: () => onJumpToMessage(thread.id, msg.id),
          });
        }
      }
    }

    const matchedNotes: PaletteAction[] = [];
    for (const note of notes) {
      const searchable = `${note.title}\n${note.content}\n${note.tags.join(' ')}`.toLowerCase();
      if (searchable.includes(q)) {
        matchedNotes.push({
          id: `note-${note.id}`,
          label: note.title,
          sublabel: note.tags.length > 0 ? note.tags.join(' · ') : undefined,
          snippet: buildCenteredSnippet(note.content, query),
          category: 'Vault Note',
          filterGroup: 'vault',
          icon: BookMarked,
          run: onOpenVault,
        });
      }
    }

    const matchedMissions: PaletteAction[] = [];
    for (const mission of missions) {
      const searchable =
        `${mission.title} ${mission.notes || ''} ${mission.priority} ${mission.dueLabel || ''}`.toLowerCase();
      if (searchable.includes(q)) {
        matchedMissions.push({
          id: `mission-${mission.id}`,
          label: mission.title,
          sublabel: `${mission.priority} · ${mission.status === 'done' ? 'Completed' : 'Active'}${
            mission.dueLabel ? ` · ${mission.dueLabel}` : ''
          }`,
          snippet: mission.notes ? buildCenteredSnippet(mission.notes, query) : undefined,
          category: 'Mission',
          filterGroup: 'missions',
          icon: CheckSquare,
          run: onOpenMissions,
        });
      }
    }

    const combined = [
      ...matchedChats,
      ...matchedNotes,
      ...matchedMissions,
      ...matchedCommands,
    ];

    const filteredByScope =
      scopeFilter === 'all'
        ? combined
        : combined.filter((item) => item.filterGroup === scopeFilter);

    return {
      results: filteredByScope,
      counts: {
        all: combined.length,
        chats: matchedChats.length + matchedCommands.filter((c) => c.filterGroup === 'chats').length,
        vault: matchedNotes.length,
        missions: matchedMissions.length,
        commands: matchedCommands.filter((c) => c.filterGroup === 'commands').length,
      },
    };
  }, [
    query,
    scopeFilter,
    commandActions,
    threads,
    notes,
    missions,
    onJumpToMessage,
    onOpenVault,
    onOpenMissions,
  ]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      results[selectedIndex].run();
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border hud-hairline-cyan bg-[#0A0F1A] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Global Search & Command Palette"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b hud-hairline bg-[#070B14]">
          <Search className="w-4 h-4 text-[#00F0FF] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Global search across chats, vault notes, missions, and commands..."
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white"
            aria-label="Close palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scope Filter Strip */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b hud-hairline bg-[#080D18] text-[11px]">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'chats', label: 'Chats' },
                { id: 'vault', label: 'Notes' },
                { id: 'missions', label: 'Missions' },
                { id: 'commands', label: 'Commands' },
              ] as const
            ).map((tab) => {
              const active = scopeFilter === tab.id;
              const count = counts[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setScopeFilter(tab.id);
                    setSelectedIndex(0);
                  }}
                  className={`px-2 py-0.5 rounded font-mono transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-cyan-500/15 text-[#00F0FF] border border-[#00F0FF]/35'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label} <span className="opacity-70 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
          <span className="hidden sm:inline font-mono text-[10px] text-slate-500 shrink-0">
            ↑↓ Navigate · Enter Open
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto divide-y divide-slate-800/40">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center space-y-1">
              <div className="text-xs font-medium text-slate-300">No matches found</div>
              <p className="text-[11px] text-slate-500">
                Try searching a keyword from past conversations, Knowledge Vault notes, or missions.
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const Icon = item.icon;
              const selected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-start justify-between gap-3 px-4 py-2.5 text-left text-xs transition-colors ${
                    selected ? 'bg-cyan-500/12 text-white' : 'text-slate-300 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        selected ? 'text-[#00F0FF]' : 'text-slate-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-medium truncate">
                          {renderHighlightedText(item.label, query)}
                        </span>
                        {item.sublabel && (
                          <span className="text-[10px] font-mono text-slate-500 truncate shrink-0">
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                      {item.snippet && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-snug">
                          {renderHighlightedText(item.snippet, query)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[10.5px] font-mono text-slate-500 mt-0.5">
                    <span
                      className={
                        item.filterGroup === 'chats'
                          ? 'text-violet-300'
                          : item.filterGroup === 'vault'
                            ? 'text-cyan-300'
                            : item.filterGroup === 'missions'
                              ? 'text-emerald-300'
                              : 'text-slate-400'
                      }
                    >
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <>
                        <span>·</span>
                        <span className="text-slate-400">{item.shortcut}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
