"use client";

// GenerativeAudio.ts — La Symphonie du Chaos.
//
// Le son est GÉNÉRÉ par les mathématiques du réseau. Pas de musique enregistrée.
// Une économie stable produit un bourdonnement harmonique, apaisant.
// Quand tu provoques une crise, le son se désaccorde. Une hyperinflation sonne
// comme un hurlement métallique distordu. Tu entends ton pays s'effondrer
// avant de le voir.
//
// Architecture : Web Audio API.
//   - 5 oscillateurs harmoniques (fréquence fondamentale + 4 harmoniques)
//   - La stabilité contrôle l'accord (stable = juste, instable = dissonant)
//   - Le risque d'instabilité contrôle le volume du "bruit de crise"
//   - L'inflation contrôle un distordeur métallique
//   - Les événements émergents déclenchent des "percussions" (chocs)

import * as React from "react";

interface AudioState {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  oscillators: OscillatorNode[];
  harmonicGains: GainNode[];
  crisisGain: GainNode | null;
  crisisNoise: AudioBufferSourceNode | null;
  distortion: WaveShaperNode | null;
  enabled: boolean;
}

export function useGenerativeAudio() {
  const stateRef = React.useRef<AudioState>({
    ctx: null,
    masterGain: null,
    oscillators: [],
    harmonicGains: [],
    crisisGain: null,
    crisisNoise: null,
    distortion: null,
    enabled: false,
  });
  const [enabled, setEnabled] = React.useState(false);

  // Initialiser le contexte audio (sur interaction utilisateur)
  const init = React.useCallback(() => {
    if (stateRef.current.ctx) {
      stateRef.current.enabled = true;
      if (stateRef.current.masterGain) {
        stateRef.current.masterGain.gain.setTargetAtTime(0.15, stateRef.current.ctx.currentTime, 0.3);
      }
      return;
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.15; // volume global bas
    masterGain.connect(ctx.destination);

    // 5 oscillateurs harmoniques (fondamentale + harmoniques)
    const fundamental = 110; // La2
    const ratios = [1, 1.5, 2, 2.5, 3]; // fondamentale, quinte, octave, tierce majeure, quinte
    const oscillators: OscillatorNode[] = [];
    const harmonicGains: GainNode[] = [];

    for (let i = 0; i < ratios.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = fundamental * ratios[i];

      const gain = ctx.createGain();
      gain.gain.value = i === 0 ? 0.4 : 0.15 / (i + 1);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();

      oscillators.push(osc);
      harmonicGains.push(gain);
    }

    // Noeud de distorsion (pour l'inflation)
    const distortion = ctx.createWaveShaper();
    distortion.curve = makeDistortionCurve(0); // 0 = pas de distorsion
    distortion.oversample = "4x";
    distortion.connect(masterGain);

    // Noeud de gain pour le bruit de crise
    const crisisGain = ctx.createGain();
    crisisGain.gain.value = 0;
    crisisGain.connect(distortion);

    // Source de bruit blanc (pour le "hurlement métallique")
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }
    const crisisNoise = ctx.createBufferSource();
    crisisNoise.buffer = noiseBuffer;
    crisisNoise.loop = true;
    crisisNoise.connect(crisisGain);
    crisisNoise.start();

    stateRef.current = {
      ctx,
      masterGain,
      oscillators,
      harmonicGains,
      crisisGain,
      crisisNoise,
      distortion,
      enabled: true,
    };
  }, []);

  // Mettre à jour le son selon l'état du système
  const update = React.useCallback(
    (stability: number, revolutionRisk: number, inflation: number, unemployment: number) => {
      const s = stateRef.current;
      if (!s.ctx || !s.enabled) return;
      const ctx = s.ctx;
      const now = ctx.currentTime;

      // Stabilité ∈ [0, 100] → accord
      // stable (100) = fréquences justes (harmonique)
      // instable (0) = fréquences dissonantes (désaccord)
      const stabNorm = Math.max(0, Math.min(1, stability / 100));

      // Désaccord : les harmoniques s'éloignent de leurs ratios justes
      const detuneAmount = (1 - stabNorm) * 50; // cents de désaccord max
      for (let i = 0; i < s.oscillators.length; i++) {
        const osc = s.oscillators[i];
        const detune = (i + 1) * detuneAmount * (Math.random() - 0.5) * 2;
        osc.detune.setTargetAtTime(detune, now, 0.5);
      }

      // Risque d'instabilité → volume du bruit de crise
      const riskNorm = Math.max(0, Math.min(1, revolutionRisk / 100));
      if (s.crisisGain) {
        s.crisisGain.gain.setTargetAtTime(riskNorm * 0.3, now, 0.3);
      }

      // Inflation → distorsion
      const inflationNorm = Math.max(0, Math.min(1, Math.abs(inflation) / 15));
      if (s.distortion) {
        s.distortion.curve = makeDistortionCurve(inflationNorm * 400);
      }

      // Chômage élevé → ralentir le tempo (baisser les fréquences)
      const unempNorm = Math.max(0, Math.min(1, unemployment / 25));
      const tempoFactor = 1 - unempNorm * 0.2;
      for (let i = 0; i < s.oscillators.length; i++) {
        const baseFreq = 110 * [1, 1.5, 2, 2.5, 3][i] * tempoFactor;
        s.oscillators[i].frequency.setTargetAtTime(baseFreq, now, 1.0);
      }
    },
    [],
  );

  // Déclencher une percussion (choc) pour un événement
  const triggerImpact = React.useCallback((intensity: number) => {
    const s = stateRef.current;
    if (!s.ctx || !s.enabled) return;
    const ctx = s.ctx;
    const now = ctx.currentTime;

    // Oscillateur court (percussion)
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 80 + Math.random() * 40;
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(intensity * 0.3, now, 0.01);
    gain.gain.setTargetAtTime(0, now + 0.1, 0.2);

    osc.connect(gain);
    gain.connect(s.masterGain!);
    osc.start(now);
    osc.stop(now + 0.5);
  }, []);

  const toggle = React.useCallback(() => {
    const s = stateRef.current;
    if (!s.ctx) {
      init();
      setEnabled(true);
      return;
    }
    s.enabled = !s.enabled;
    if (s.masterGain) {
      s.masterGain.gain.setTargetAtTime(s.enabled ? 0.15 : 0, s.ctx.currentTime, 0.3);
    }
    setEnabled(s.enabled);
  }, [init]);

  return { init, update, triggerImpact, toggle, enabled };
}

// Crée une courbe de distorsion (WaveShaper)
function makeDistortionCurve(amount: number): Float32Array {
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
