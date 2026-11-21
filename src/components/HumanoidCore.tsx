import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AppTheme, PersonalityMode, VoiceState } from '../types';
import { PERSONALITY_PROFILES } from '../lib/storage';

export interface HapticPulseSignal {
  id: number;
  reason: 'tool-chain' | 'high-confidence';
}

interface HumanoidCoreProps {
  voiceState: VoiceState;
  personalityMode: PersonalityMode;
  appTheme?: AppTheme;
  analyser: AnalyserNode | null;
  interimTranscript: string;
  wakeWordPhrase: string;
  wakeWordEnabled: boolean;
  docked: boolean;
  hapticPulse?: HapticPulseSignal | null;
  onCoreClick: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
  hueShift: number;
}

const STATE_STATUS_TEXT: Record<VoiceState, string> = {
  IDLE: 'Standby',
  WAKE_ARMED: 'Wake Word Armed',
  LISTENING: 'Listening to Command',
  THINKING: 'Reasoning',
  SPEAKING: 'Speaking',
};

function resolveAvatarTheme(voiceState: VoiceState, personalityMode: PersonalityMode) {
  const profile = PERSONALITY_PROFILES[personalityMode] || PERSONALITY_PROFILES.jarvis;

  if (voiceState === 'LISTENING') {
    return {
      primary: '#10B981',
      secondary: profile.primaryColor,
      skinHighlight: 'rgba(16, 185, 129, 0.30)',
      auraRgba: 'rgba(16, 185, 129, 0.28)',
      statusText: STATE_STATUS_TEXT[voiceState],
      personalityLabel: profile.label,
    };
  }

  return {
    primary: profile.primaryColor,
    secondary: profile.secondaryColor,
    skinHighlight: profile.skinHighlight,
    auraRgba: profile.auraRgba,
    statusText: STATE_STATUS_TEXT[voiceState],
    personalityLabel: profile.label,
  };
}

export const HumanoidCore: React.FC<HumanoidCoreProps> = ({
  voiceState,
  personalityMode,
  appTheme = 'obsidian',
  analyser,
  interimTranscript,
  wakeWordPhrase,
  wakeWordEnabled,
  docked,
  hapticPulse,
  onCoreClick,
}) => {
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [liveEnergy, setLiveEnergy] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);
  const [activePulse, setActivePulse] = useState<HapticPulseSignal | null>(null);

  // Trigger transient screen-edge haptic pulse envelope when signal updates
  useEffect(() => {
    if (!hapticPulse) return;
    setActivePulse(hapticPulse);
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(hapticPulse.reason === 'tool-chain' ? [16, 28, 22] : [20]);
      }
    } catch {
      // ignore on unsupported hosts
    }
    const timer = window.setTimeout(() => {
      setActivePulse((curr) => (curr?.id === hapticPulse.id ? null : curr));
    }, 1350);
    return () => window.clearTimeout(timer);
  }, [hapticPulse]);

  // Organic blinking cycle
  useEffect(() => {
    if (prefersReducedMotion) return;
    let timeoutId: number;
    const scheduleBlink = () => {
      const delay = 2600 + Math.random() * 3400;
      timeoutId = window.setTimeout(() => {
        setIsBlinking(true);
        window.setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 150);
      }, delay);
    };
    scheduleBlink();
    return () => window.clearTimeout(timeoutId);
  }, [prefersReducedMotion]);

  // Smooth audio amplitude sampler & organic particle field
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particleCount = docked ? 24 : 46;
    const particles: Particle[] = Array.from({ length: particleCount }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0012,
      vy: -0.0005 - Math.random() * 0.0014,
      radius: 1 + Math.random() * 2.1,
      alpha: 0.2 + Math.random() * 0.55,
      phase: (i / particleCount) * Math.PI * 2,
      hueShift: i % 3,
    }));

    const BAR_COUNT = 64;
    const smoothedBins = new Float32Array(BAR_COUNT);
    const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    // Ambient inward 'data-flow' streams active during IDLE background processing
    const dataFlowCount = docked ? 14 : 26;
    const dataFlowParticles = Array.from({ length: dataFlowCount }, (_, i) => ({
      angle: (i / dataFlowCount) * Math.PI * 2 + Math.random() * 0.4,
      distNorm: 0.15 + Math.random() * 0.85,
      speed: 0.0024 + Math.random() * 0.0028,
      curve: (i % 2 === 0 ? 1 : -1) * (0.0035 + Math.random() * 0.004),
      size: docked ? 0.9 + Math.random() * 0.8 : 1.1 + Math.random() * 1.1,
      hueShift: i % 2,
    }));

    let rafId = 0;
    let tick = 0;
    let smoothedEnergy = 0;
    let ringVisibility = 0;
    let dataFlowVisibility = voiceState === 'IDLE' ? 1 : 0;

    const renderParticles = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0 && (canvas.width !== w * dpr || canvas.height !== h * dpr)) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      tick += prefersReducedMotion ? 0 : 0.025;

      const isFreqActive = voiceState === 'LISTENING' || voiceState === 'SPEAKING';
      ringVisibility += ((isFreqActive ? 1 : 0) - ringVisibility) * 0.14;
      dataFlowVisibility += (((voiceState === 'IDLE' ? 1 : 0) - dataFlowVisibility) * 0.08);

      let targetEnergy = 0.06;
      const idleBreathWave = 0.5 - 0.5 * Math.cos(tick * 1.18);
      let hasLiveMicSignal = false;

      if (analyser && freqData && (voiceState === 'LISTENING' || voiceState === 'WAKE_ARMED' || voiceState === 'SPEAKING')) {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        const bins = Math.min(32, freqData.length);
        for (let i = 0; i < bins; i++) sum += freqData[i];
        const micLevel = Math.min(1, sum / (bins * 115));
        if (micLevel > 0.02) {
          hasLiveMicSignal = true;
        }
        if (voiceState === 'LISTENING' || voiceState === 'WAKE_ARMED') {
          targetEnergy = micLevel;
        } else {
          // In SPEAKING state, blend live microphone input with expressive vocal cadence
          const synthLevel = 0.35 + 0.45 * Math.abs(Math.sin(tick * 2.6) * Math.cos(tick * 1.3));
          targetEnergy = hasLiveMicSignal ? Math.max(micLevel, synthLevel * 0.65) : synthLevel;
        }
      } else if (voiceState === 'SPEAKING') {
        targetEnergy = 0.35 + 0.45 * Math.abs(Math.sin(tick * 2.6) * Math.cos(tick * 1.3));
      } else if (voiceState === 'THINKING') {
        targetEnergy = 0.28 + 0.18 * Math.sin(tick * 1.9);
      } else if (voiceState === 'IDLE') {
        // Gentle respiratory energy wave synchronized with the avatar's idle breathe rhythm
        targetEnergy = 0.07 + idleBreathWave * 0.15;
      }

      // Populate and smooth circular frequency spectrum bins
      for (let i = 0; i < BAR_COUNT; i++) {
        let targetBin = 0;
        if (isFreqActive) {
          // Mirror lower-to-mid voice frequencies symmetrically around the circle
          const half = BAR_COUNT / 2;
          const mirrorIdx = i < half ? i : BAR_COUNT - 1 - i;
          const normIdx = mirrorIdx / half;

          let micBin = 0;
          if (analyser && freqData) {
            const binIdx = Math.min(freqData.length - 1, Math.floor(normIdx * Math.min(28, freqData.length - 1)));
            micBin = Math.min(1, freqData[binIdx] / 190);
          }

          if (voiceState === 'LISTENING') {
            // Live microphone FFT with subtle baseline shimmer so ring stays alive at low volume
            const baseline = 0.06 + 0.04 * Math.sin(tick * 2.4 + i * 0.35);
            targetBin = Math.max(baseline, micBin);
          } else {
            // SPEAKING: blend live mic FFT if present with organic multi-band vocal harmonics
            const formantA = Math.abs(Math.sin(tick * 3.1 + normIdx * 5.2));
            const formantB = Math.abs(Math.cos(tick * 1.9 - normIdx * 3.4));
            const synthBin = (0.18 + 0.65 * formantA * formantB) * (0.6 + smoothedEnergy * 0.6);
            targetBin = hasLiveMicSignal ? Math.max(micBin, synthBin * 0.55) : synthBin;
          }
        }
        smoothedBins[i] += (targetBin - smoothedBins[i]) * 0.28;
      }

      smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.22;
      if (Math.floor(tick * 40) % 2 === 0) {
        setLiveEnergy(smoothedEnergy);
      }

      if (w > 0 && h > 0) {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const theme = resolveAvatarTheme(voiceState, personalityMode);
        const cx = w / 2;
        const cy = h * 0.48;
        const minDim = Math.min(w, h);

        // Ambient IDLE 'Data-Flow' Particle Streams flowing inward toward the core
        if (dataFlowVisibility > 0.02) {
          const maxFlowRadius = minDim * (docked ? 0.48 : 0.47);
          const minFlowRadius = minDim * (docked ? 0.08 : 0.075);

          ctx.save();
          ctx.lineCap = 'round';
          for (const df of dataFlowParticles) {
            if (!prefersReducedMotion) {
              df.distNorm -= df.speed;
              df.angle += df.curve;
              if (df.distNorm <= 0.12) {
                df.distNorm = 0.96 + Math.random() * 0.08;
                df.angle = Math.random() * Math.PI * 2;
              }
            }

            const progress = Math.min(1, Math.max(0, (1 - df.distNorm) / 0.88));
            const fadeEnvelope = Math.sin(progress * Math.PI);
            const rHead = minFlowRadius + df.distNorm * (maxFlowRadius - minFlowRadius);
            const rTail = rHead + (docked ? 5 : 10) * (0.4 + fadeEnvelope * 0.6);

            const hx = cx + Math.cos(df.angle) * rHead;
            const hy = cy + Math.sin(df.angle) * rHead;
            const tx = cx + Math.cos(df.angle - df.curve * 4.5) * rTail;
            const ty = cy + Math.sin(df.angle - df.curve * 4.5) * rTail;

            const streamColor = df.hueShift === 0 ? theme.primary : theme.secondary;

            // Soft trailing data wake
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(hx, hy);
            ctx.strokeStyle = streamColor;
            ctx.lineWidth = df.size * 0.85;
            ctx.globalAlpha = dataFlowVisibility * fadeEnvelope * 0.28;
            ctx.stroke();

            // Leading luminous data mote
            ctx.beginPath();
            ctx.arc(hx, hy, df.size, 0, Math.PI * 2);
            ctx.fillStyle = streamColor;
            ctx.globalAlpha = dataFlowVisibility * fadeEnvelope * 0.58;
            ctx.fill();
          }
          ctx.restore();
        }

        // Render Dynamic Circular Frequency Visualizer around the HumanoidCore
        if (ringVisibility > 0.02) {
          const baseRadius = minDim * (docked ? 0.28 : 0.305) + smoothedEnergy * (docked ? 3 : 6);
          const maxBarLen = minDim * (docked ? 0.12 : 0.115);
          const rotationOffset = -Math.PI / 2 + (prefersReducedMotion ? 0 : tick * 0.18);

          ctx.save();
          ctx.globalAlpha = ringVisibility * 0.35;
          ctx.beginPath();
          ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = theme.primary;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Continuous outer harmonic wave contour
          ctx.beginPath();
          for (let i = 0; i <= BAR_COUNT; i++) {
            const idx = i % BAR_COUNT;
            const angle = rotationOffset + (idx / BAR_COUNT) * Math.PI * 2;
            const amp = smoothedBins[idx] * maxBarLen;
            const r = baseRadius + 3 + amp;
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.globalAlpha = ringVisibility * 0.28;
          ctx.strokeStyle = theme.secondary;
          ctx.lineWidth = 1.25;
          ctx.stroke();

          // Radial frequency spectrum bars
          ctx.lineCap = 'round';
          ctx.shadowColor = theme.primary;
          ctx.shadowBlur = docked ? 6 : 10;
          for (let i = 0; i < BAR_COUNT; i++) {
            const angle = rotationOffset + (i / BAR_COUNT) * Math.PI * 2;
            const barLen = 2 + smoothedBins[i] * maxBarLen;
            const rInner = baseRadius + 2;
            const rOuter = rInner + barLen;

            const x1 = cx + Math.cos(angle) * rInner;
            const y1 = cy + Math.sin(angle) * rInner;
            const x2 = cx + Math.cos(angle) * rOuter;
            const y2 = cy + Math.sin(angle) * rOuter;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = i % 2 === 0 ? theme.primary : theme.secondary;
            ctx.lineWidth = docked ? 1.5 : 2.1;
            ctx.globalAlpha = ringVisibility * (0.45 + smoothedBins[i] * 0.55);
            ctx.stroke();
          }
          ctx.restore();
        }

        for (const p of particles) {
          if (!prefersReducedMotion) {
            const px = p.x * w;
            const py = p.y * h;
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.max(12, Math.hypot(dx, dy));

            if (voiceState === 'SPEAKING') {
              // Radiate gently outward with vocal energy
              const push = (0.0009 + smoothedEnergy * 0.0024) / (dist * 0.015 + 1);
              p.x += (dx / dist) * push + Math.sin(tick + p.phase) * 0.0005;
              p.y += (dy / dist) * push - 0.0004;
            } else if (voiceState === 'THINKING') {
              // Organic swirling synaptic currents around head
              const angle = Math.atan2(dy, dx) + 0.018;
              const targetRadius = (docked ? 44 : 88) + Math.sin(tick * 1.5 + p.phase) * 18;
              const rx = cx + Math.cos(angle) * (dist + (targetRadius - dist) * 0.03);
              const ry = cy + Math.sin(angle) * (dist + (targetRadius - dist) * 0.03);
              p.x = rx / w;
              p.y = ry / h;
            } else if (voiceState === 'LISTENING') {
              // Draw softly inward toward the listening avatar
              p.x -= (dx / dist) * 0.0008 + Math.cos(tick + p.phase) * 0.0004;
              p.y -= (dy / dist) * 0.0008;
            } else if (voiceState === 'IDLE') {
              // Calm respiratory drift: gentle outward swell on inhale, soft settle on exhale
              const breathPush = Math.sin(tick * 1.18) * 0.00045;
              p.x += p.vx + (dx / dist) * breathPush + Math.sin(tick * 0.65 + p.phase) * 0.0003;
              p.y += p.vy * 0.8 + (dy / dist) * breathPush;
            } else {
              // Calm buoyant ambient drift
              p.x += p.vx + Math.sin(tick * 0.7 + p.phase) * 0.00035;
              p.y += p.vy;
            }

            if (p.y < -0.05) p.y = 1.05;
            if (p.y > 1.05) p.y = -0.05;
            if (p.x < -0.05) p.x = 1.05;
            if (p.x > 1.05) p.x = -0.05;
          }

          const drawX = p.x * w;
          const drawY = p.y * h;
          const glowAlpha = Math.min(0.95, p.alpha * (0.65 + smoothedEnergy * 0.9));

          ctx.beginPath();
          ctx.arc(drawX, drawY, p.radius * (1 + smoothedEnergy * 0.35), 0, Math.PI * 2);
          ctx.fillStyle = p.hueShift === 0 ? theme.secondary : theme.primary;
          ctx.globalAlpha = glowAlpha;
          ctx.fill();
        }
        ctx.restore();
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(renderParticles);
      }
    };

    renderParticles();
    return () => cancelAnimationFrame(rafId);
  }, [voiceState, personalityMode, analyser, docked, prefersReducedMotion]);

  const theme = resolveAvatarTheme(voiceState, personalityMode);

  // Organic avatar motion choreography by voice state (with dedicated IDLE 'breathe' cadence)
  const isIdle = voiceState === 'IDLE';
  const breatheTransition = {
    duration: 5.2,
    times: [0, 0.44, 1],
    repeat: Infinity,
    ease: 'easeInOut' as const,
  };

  const avatarContainerVariants = {
    IDLE: {
      scale: [1, 1.024, 1],
      y: [0, -5, 0],
      rotate: [0, 0.5, 0],
      transition: breatheTransition,
    },
    WAKE_ARMED: {
      scale: [1.01, 1.028, 1.01],
      y: [0, -3, 0],
      transition: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' as const },
    },
    LISTENING: {
      scale: 1.04 + liveEnergy * 0.04,
      y: -3,
      transition: { type: 'spring' as const, stiffness: 210, damping: 18 },
    },
    THINKING: {
      scale: [1.01, 1.05, 1.01],
      y: [-2, -6, -2],
      transition: { duration: 1.9, repeat: Infinity, ease: 'easeInOut' as const },
    },
    SPEAKING: {
      scale: 1.05 + liveEnergy * 0.075,
      y: -3,
      transition: { type: 'spring' as const, stiffness: 260, damping: 16 },
    },
  };

  const auraVariants = {
    IDLE: {
      scale: [0.92, 1.1, 0.92],
      opacity: [0.38, 0.74, 0.38],
      transition: breatheTransition,
    },
    WAKE_ARMED: {
      scale: [0.98, 1.07, 0.98],
      opacity: [0.55, 0.78, 0.55],
      transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const },
    },
    LISTENING: {
      scale: 1.12 + liveEnergy * 0.18,
      opacity: 0.75 + liveEnergy * 0.25,
      transition: { type: 'spring' as const, stiffness: 200, damping: 16 },
    },
    THINKING: {
      scale: [1.0, 1.18, 1.0],
      opacity: [0.5, 0.9, 0.5],
      transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' as const },
    },
    SPEAKING: {
      scale: 1.15 + liveEnergy * 0.24,
      opacity: 0.72 + liveEnergy * 0.28,
      transition: { type: 'spring' as const, stiffness: 240, damping: 15 },
    },
  };

  // Mouth aperture scales organically with speaking/listening amplitude
  const mouthOpenAmount =
    voiceState === 'SPEAKING'
      ? 2.2 + liveEnergy * 7.5
      : voiceState === 'LISTENING'
        ? 1.2 + liveEnergy * 4.2
        : 0.6;

  return (
    <div
      className={`flex flex-col items-center justify-center select-none transition-all duration-500 ${
        docked ? 'py-2 border-b hud-hairline bg-[#060912]/75' : 'py-5 flex-1 min-h-[300px]'
      }`}
    >
      {/* Subtle Screen-Edge Haptic Pulse Glow Overlay */}
      <AnimatePresence>
        {activePulse && (
          <motion.div
            key={`edge-haptic-${activePulse.id}`}
            initial={{ opacity: 0 }}
            animate={
              prefersReducedMotion
                ? { opacity: [0, 0.45, 0] }
                : { opacity: [0, 0.85, 0.3, 0.72, 0] }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, times: [0, 0.16, 0.42, 0.62, 1], ease: 'easeOut' }}
            className="fixed inset-0 pointer-events-none z-30"
            style={{
              boxShadow:
                activePulse.reason === 'tool-chain'
                  ? `inset 0 0 72px 10px ${theme.auraRgba}, inset 0 0 22px 2px ${theme.primary}66`
                  : `inset 0 0 64px 8px ${theme.auraRgba}, inset 0 0 18px 1px ${theme.secondary}55`,
              background: `radial-gradient(ellipse at center, transparent 64%, ${theme.auraRgba} 100%)`,
            }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={onCoreClick}
        className={`relative flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF] rounded-3xl transition-all ${
          docked ? 'w-44 h-32' : 'w-72 h-68 sm:w-80 sm:h-72'
        }`}
        title={
          voiceState === 'SPEAKING'
            ? 'Click to stop speaking'
            : voiceState === 'LISTENING'
              ? 'Click to stop listening'
              : 'Click to speak'
        }
        aria-label="Humanoid AI Avatar Voice Trigger"
      >
        {/* Synchronized Haptic Shockwave Halo around Avatar */}
        <AnimatePresence>
          {activePulse && !prefersReducedMotion && (
            <motion.div
              key={`core-haptic-${activePulse.id}`}
              initial={{ scale: 0.72, opacity: 0.8 }}
              animate={{ scale: 1.48, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.05, ease: 'easeOut' }}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: docked ? '68%' : '76%',
                height: docked ? '76%' : '76%',
                border: `1.5px solid ${
                  activePulse.reason === 'tool-chain' ? theme.primary : theme.secondary
                }`,
                boxShadow: `0 0 24px ${theme.auraRgba}`,
              }}
            />
          )}
        </AnimatePresence>

        {/* Subtle Particle Field Layer */}
        <canvas
          ref={particleCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Soft Breathing / Expanding Volumetric Glow Aura */}
        <motion.div
          variants={auraVariants}
          animate={prefersReducedMotion ? undefined : voiceState}
          className="absolute rounded-full pointer-events-none blur-2xl"
          style={{
            width: docked ? '68%' : '74%',
            height: docked ? '72%' : '74%',
            background: `radial-gradient(circle, ${theme.auraRgba} 0%, rgba(139, 92, 246, 0.12) 55%, rgba(5, 7, 12, 0) 78%)`,
          }}
        />

        {/* Anthropomorphic Glowing Humanoid Bust */}
        <motion.div
          variants={avatarContainerVariants}
          animate={prefersReducedMotion ? undefined : voiceState}
          className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none"
        >
          <svg
            viewBox="0 0 240 240"
            className="w-full h-full overflow-visible drop-shadow-[0_0_18px_rgba(0,240,255,0.22)]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="aetherBodyFill" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop
                  offset="0%"
                  stopColor={
                    appTheme === 'cyber-day'
                      ? '#DCE8F5'
                      : appTheme === 'high-contrast'
                        ? '#080808'
                        : '#16223B'
                  }
                  stopOpacity="0.95"
                />
                <stop
                  offset="55%"
                  stopColor={
                    appTheme === 'cyber-day'
                      ? '#C2D4EA'
                      : appTheme === 'high-contrast'
                        ? '#000000'
                        : '#0D1528'
                  }
                  stopOpacity="0.94"
                />
                <stop
                  offset="100%"
                  stopColor={
                    appTheme === 'cyber-day'
                      ? '#9EB8D8'
                      : appTheme === 'high-contrast'
                        ? '#000000'
                        : '#070B16'
                  }
                  stopOpacity="0.2"
                />
              </linearGradient>

              <radialGradient id="aetherFaceGlow" cx="50%" cy="38%" r="54%">
                <stop offset="0%" stopColor={theme.skinHighlight} />
                <stop
                  offset="70%"
                  stopColor={
                    appTheme === 'cyber-day'
                      ? 'rgba(203, 219, 238, 0.78)'
                      : appTheme === 'high-contrast'
                        ? 'rgba(0, 0, 0, 0.92)'
                        : 'rgba(15, 23, 42, 0.72)'
                  }
                />
                <stop
                  offset="100%"
                  stopColor={
                    appTheme === 'cyber-day'
                      ? 'rgba(162, 186, 214, 0.92)'
                      : appTheme === 'high-contrast'
                        ? 'rgba(0, 0, 0, 0.98)'
                        : 'rgba(7, 11, 20, 0.95)'
                  }
                />
              </radialGradient>

              <linearGradient id="aetherEdgeStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={theme.primary} stopOpacity="0.9" />
                <stop offset="50%" stopColor={theme.secondary} stopOpacity="0.65" />
                <stop offset="100%" stopColor={theme.primary} stopOpacity="0.3" />
              </linearGradient>

              <filter id="softBioGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Torso, Neck & Humanoid Shoulders Silhouette with IDLE Chest Breathe Rise */}
            <motion.g
              style={{ transformOrigin: '120px 212px' }}
              animate={
                !prefersReducedMotion && isIdle
                  ? {
                      scaleX: [1, 1.022, 1],
                      scaleY: [1, 1.03, 1],
                      y: [0, -2.2, 0],
                    }
                  : { scaleX: 1, scaleY: 1, y: 0 }
              }
              transition={!prefersReducedMotion && isIdle ? breatheTransition : { duration: 0.35 }}
            >
              <path
                d="M 38 228
                   C 44 192, 62 174, 92 162
                   C 99 158, 102 146, 101 132
                   L 139 132
                   C 138 146, 141 158, 148 162
                   C 178 174, 196 192, 202 228 Z"
                fill="url(#aetherBodyFill)"
                stroke="url(#aetherEdgeStroke)"
                strokeWidth="1.2"
                strokeOpacity="0.65"
              />

              {/* Collarbone & Neck Anatomical Shading Lines */}
              <path
                d="M 68 184 Q 100 174 120 183 Q 140 174 172 184"
                fill="none"
                stroke={theme.primary}
                strokeWidth="1.1"
                strokeOpacity="0.4"
              />
              <path
                d="M 104 139 Q 113 162 120 178 Q 127 162 136 139"
                fill="none"
                stroke={theme.secondary}
                strokeWidth="1"
                strokeOpacity="0.35"
              />

              {/* Throat / Chest Core Luminance (breathes softly in IDLE, pulses when speaking) */}
              <motion.ellipse
                cx="120"
                cy="158"
                fill={theme.primary}
                filter="url(#softBioGlow)"
                animate={
                  !prefersReducedMotion && isIdle
                    ? {
                        rx: [5.5, 9.5, 5.5],
                        ry: [7.5, 13, 7.5],
                        opacity: [0.09, 0.3, 0.09],
                      }
                    : {
                        rx: voiceState === 'SPEAKING' ? 10 + liveEnergy * 7 : 6,
                        ry: voiceState === 'SPEAKING' ? 14 + liveEnergy * 9 : 8,
                        opacity: voiceState === 'SPEAKING' ? 0.25 + liveEnergy * 0.35 : 0.12,
                      }
                }
                transition={!prefersReducedMotion && isIdle ? breatheTransition : { duration: 0.18 }}
              />
            </motion.g>

            {/* Subtle Ears Contour */}
            <path
              d="M 79 88 C 72 90, 72 108, 79 113"
              fill="none"
              stroke={theme.primary}
              strokeWidth="1.2"
              strokeOpacity="0.45"
            />
            <path
              d="M 161 88 C 168 90, 168 108, 161 113"
              fill="none"
              stroke={theme.primary}
              strokeWidth="1.2"
              strokeOpacity="0.45"
            />

            {/* Sculpted Anthropomorphic Head & Jawline */}
            <path
              d="M 120 32
                 C 148 32, 164 54, 163 86
                 C 162 106, 156 122, 146 134
                 C 138 143, 129 148, 120 148
                 C 111 148, 102 143, 94 134
                 C 84 122, 78 106, 77 86
                 C 76 54, 92 32, 120 32 Z"
              fill="url(#aetherFaceGlow)"
              stroke="url(#aetherEdgeStroke)"
              strokeWidth="1.6"
            />

            {/* Organic Cranial Crown & Subtle Cheekbone Contours */}
            <path
              d="M 88 64 Q 120 44 152 64"
              fill="none"
              stroke={theme.secondary}
              strokeWidth="1"
              strokeOpacity={voiceState === 'THINKING' ? 0.85 : 0.32}
            />
            <path
              d="M 84 102 Q 96 116 105 128 M 156 102 Q 144 116 135 128"
              fill="none"
              stroke={theme.primary}
              strokeWidth="0.9"
              strokeOpacity="0.28"
            />

            {/* Thinking Neural Synaptic Pulse (only brightens when reasoning) */}
            {voiceState === 'THINKING' && (
              <motion.g
                initial={{ opacity: 0.2 }}
                animate={{ opacity: [0.25, 0.9, 0.25] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                filter="url(#softBioGlow)"
              >
                <circle cx="120" cy="54" r="3" fill={theme.primary} />
                <circle cx="101" cy="63" r="2" fill={theme.secondary} />
                <circle cx="139" cy="63" r="2" fill={theme.secondary} />
                <path
                  d="M 101 63 L 120 54 L 139 63"
                  fill="none"
                  stroke={theme.primary}
                  strokeWidth="1"
                />
              </motion.g>
            )}

            {/* Eyebrows (expressive organic arch) */}
            <motion.path
              d="M 91 77 Q 102 72 112 77"
              fill="none"
              stroke={theme.primary}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeOpacity="0.7"
              animate={{ y: voiceState === 'LISTENING' || voiceState === 'THINKING' ? -1.5 : 0 }}
              transition={{ duration: 0.3 }}
            />
            <motion.path
              d="M 128 77 Q 138 72 149 77"
              fill="none"
              stroke={theme.primary}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeOpacity="0.7"
              animate={{ y: voiceState === 'LISTENING' || voiceState === 'THINKING' ? -1.5 : 0 }}
              transition={{ duration: 0.3 }}
            />

            {/* Left & Right Anthropomorphic Eyes with Natural Blinking */}
            {[102, 138].map((eyeX, idx) => (
              <motion.g
                key={idx}
                style={{ transformOrigin: `${eyeX}px 87px` }}
                animate={{ scaleY: isBlinking ? 0.08 : 1 }}
                transition={{ duration: 0.09 }}
              >
                {/* Almond eye contour */}
                <path
                  d={`M ${eyeX - 10} 87 Q ${eyeX} 80 ${eyeX + 10} 87 Q ${eyeX} 94 ${eyeX - 10} 87 Z`}
                  fill="rgba(0, 240, 255, 0.14)"
                  stroke={theme.primary}
                  strokeWidth="1.2"
                />
                {/* Luminous Iris with subtle IDLE vitality breath */}
                <motion.circle
                  cx={eyeX}
                  cy="87"
                  r={voiceState === 'LISTENING' ? 4.2 : 3.6}
                  fill={theme.primary}
                  filter="url(#softBioGlow)"
                  style={{ transformOrigin: `${eyeX}px 87px` }}
                  animate={
                    !prefersReducedMotion && isIdle
                      ? { scale: [0.95, 1.08, 0.95], opacity: [0.76, 1, 0.76] }
                      : { scale: 1, opacity: 1 }
                  }
                  transition={!prefersReducedMotion && isIdle ? breatheTransition : { duration: 0.2 }}
                />
                {/* Soft White Specular Highlight */}
                <circle cx={eyeX - 1.2} cy="85.8" r="1.2" fill="#FFFFFF" opacity="0.92" />
              </motion.g>
            ))}

            {/* Delicate Nose Bridge & Tip Shadow */}
            <path
              d="M 120 88 L 118.5 107 Q 120 110 123 108"
              fill="none"
              stroke={theme.primary}
              strokeWidth="1"
              strokeOpacity="0.45"
              strokeLinecap="round"
            />

            {/* Fluid Anthropomorphic Mouth / Lips (breathes softly when IDLE, expands when speaking) */}
            <g filter="url(#softBioGlow)">
              {/* Upper Lip */}
              <motion.path
                d={`M 106 124 Q 113 ${121 - mouthOpenAmount * 0.25} 120 ${122.5 - mouthOpenAmount * 0.25} Q 127 ${121 - mouthOpenAmount * 0.25} 134 124`}
                fill="none"
                stroke={theme.primary}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Soft Inner Vocal Glow */}
              <motion.ellipse
                cx="120"
                cy="124.5"
                rx={9 + (voiceState === 'SPEAKING' ? liveEnergy * 4 : 0)}
                fill={theme.primary}
                animate={
                  !prefersReducedMotion && isIdle
                    ? { ry: [0.55, 1.15, 0.55], opacity: [0.08, 0.22, 0.08] }
                    : {
                        ry: mouthOpenAmount,
                        opacity: voiceState === 'SPEAKING' ? 0.38 + liveEnergy * 0.45 : 0.12,
                      }
                }
                transition={!prefersReducedMotion && isIdle ? breatheTransition : { duration: 0.12 }}
              />
              {/* Lower Lip */}
              <motion.path
                d={`M 107 124.5 Q 120 ${126.5 + mouthOpenAmount * 1.15} 133 124.5`}
                fill="none"
                stroke={theme.primary}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeOpacity="0.85"
              />
            </g>
          </svg>
        </motion.div>
      </button>

      {/* Clean Status & Live Transcript Caption */}
      <div className="text-center px-4 max-w-xl mt-1">
        <div className="inline-flex items-center gap-2 text-xs font-mono">
          <span style={{ color: theme.primary }} className="font-semibold tracking-wide uppercase">
            {theme.statusText}
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-300">{theme.personalityLabel}</span>
          {wakeWordEnabled && (
            <>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-slate-400">Say &ldquo;{wakeWordPhrase}&rdquo;</span>
            </>
          )}
        </div>

        {interimTranscript ? (
          <p className="mt-1.5 text-sm text-emerald-300 font-medium">{interimTranscript}</p>
        ) : !docked ? (
          <p className="mt-1.5 text-sm text-slate-400">
            {wakeWordEnabled
              ? `Listening passively for "${wakeWordPhrase}" — speak naturally or type below.`
              : 'Click the avatar or enable "Hey Jarvis" voice wake below.'}
          </p>
        ) : null}
      </div>
    </div>
  );
};
