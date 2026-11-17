let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioCtx = new AudioContextCtor();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  durationSec: number,
  type: OscillatorType,
  gainPeak: number,
  delaySec = 0
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

export function playSignalGeneratedSound(enabled: boolean): void {
  if (!enabled) return;
  playTone(523.25, 0.14, 'sine', 0.06, 0);
  playTone(659.25, 0.18, 'sine', 0.05, 0.08);
}

export function playOutcomeSafeSound(enabled: boolean): void {
  if (!enabled) return;
  playTone(587.33, 0.12, 'triangle', 0.06, 0);
  playTone(880, 0.22, 'triangle', 0.05, 0.09);
}

export function playOutcomeMineSound(enabled: boolean): void {
  if (!enabled) return;
  playTone(220, 0.18, 'sawtooth', 0.04, 0);
  playTone(164.81, 0.24, 'sawtooth', 0.04, 0.11);
}
