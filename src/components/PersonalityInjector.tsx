import React, { useState } from 'react';
import { Sparkles, ChevronDown, X } from 'lucide-react';
import { PersonalityMode } from '../types';
import { PERSONALITY_PROFILES } from '../lib/storage';

interface PersonalityInjectorProps {
  mode: PersonalityMode;
  onChangeMode: (mode: PersonalityMode) => void;
}

const MODES: PersonalityMode[] = ['jarvis', 'cortana', 'hal'];

export const PersonalityInjector: React.FC<PersonalityInjectorProps> = ({
  mode,
  onChangeMode,
}) => {
  const [open, setOpen] = useState(false);
  const active = PERSONALITY_PROFILES[mode];

  return (
    <div className="relative">
      <div className="inline-flex items-center rounded-lg border hud-hairline bg-[#060912] p-0.5 gap-0.5">
        {MODES.map((m) => {
          const profile = PERSONALITY_PROFILES[m];
          const isSelected = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChangeMode(m)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isSelected
                  ? 'text-white bg-slate-800/90'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={
                isSelected
                  ? { boxShadow: `inset 0 0 0 1px ${profile.primaryColor}66`, color: profile.primaryColor }
                  : undefined
              }
              title={`${profile.label} (${profile.tagline})`}
            >
              {m === 'jarvis' ? 'Jarvis' : m === 'cortana' ? 'Cortana' : 'HAL'}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-1 rounded-md text-slate-400 hover:text-white transition-colors"
          title="Inspect Personality Injector Prompt"
          aria-label="Inspect Personality Injector Prompt"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-xl border hud-hairline-cyan bg-[#0A0F1A] p-3.5 shadow-2xl z-40 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <Sparkles className="w-3.5 h-3.5" style={{ color: active.primaryColor }} />
              <span>Personality Injector</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-slate-400 hover:text-white"
              aria-label="Close personality inspector"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5">
            {MODES.map((m) => {
              const profile = PERSONALITY_PROFILES[m];
              const isSelected = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeMode(m)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-slate-900/90 border-slate-600'
                      : 'bg-[#060912] border-slate-800/70 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold" style={{ color: profile.primaryColor }}>
                      {profile.label}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">{profile.tagline}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border hud-hairline bg-[#060912] p-2.5 space-y-1">
            <div className="text-[11px] font-mono text-slate-400">Injected System Directive</div>
            <p className="text-[11px] text-slate-300 leading-relaxed">{active.systemPromptInjection}</p>
          </div>
        </div>
      )}
    </div>
  );
};
