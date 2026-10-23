import { useEffect, useRef, useState } from 'react';

export type VoiceCommand = 'open' | 'mirror' | 'dashboard' | 'menu';

interface Options {
  enabled: boolean;
  onCommand: (cmd: VoiceCommand, heard: string) => void;
  lang?: string;
}

interface SRAlt { transcript: string }
interface SRResult { length: number; isFinal: boolean; [index: number]: SRAlt }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  abort(): void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SRCtor = new () => SRInstance;

const getCtor = (): SRCtor | null => {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const parse = (text: string): VoiceCommand | null => {
  const s = text.toLowerCase();
  if (/\bdash\s?board\b/.test(s)) return 'dashboard';
  if (/\b(menu|home)\b/.test(s)) return 'menu';
  if (/\b(mirror|back|close|closed|closing)\b/.test(s)) return 'mirror';
  if (/\b(open|opens|opened|opening|oh pen|start|show)\b/.test(s)) return 'open';
  return null;
};

const PRIORITY: VoiceCommand[] = ['dashboard', 'menu', 'mirror', 'open'];

export function useVoiceCommand({ enabled, onCommand, lang = 'en-US' }: Options) {
  const supported = getCtor() !== null;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0); // 0..1 live microphone level
  const cbRef = useRef(onCommand);
  cbRef.current = onCommand;

  useEffect(() => {
    const Ctor = getCtor();
    if (!enabled || !Ctor) return;

    let stopped = false;
    let gotResult = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCmd: VoiceCommand | null = null;
    let lastAt = 0;
    let rec: SRInstance | null = null;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let meterTimer: ReturnType<typeof setInterval> | null = null;
    let lastLevel = 0;
    let quickEnds = 0;
    let startedAt = 0;

    const fire = (cmd: VoiceCommand, heard: string) => {
      const now = Date.now();
      if (cmd === lastCmd && now - lastAt < 1500) return;
      lastCmd = cmd;
      lastAt = now;
      console.log('[voice] COMMAND ->', cmd, '| heard:', heard);
      cbRef.current(cmd, heard);
    };

    // ── 1) microphone check + level meter ──
    const startMeter = async (): Promise<boolean> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }
        const label = stream.getAudioTracks()[0]?.label ?? 'unknown';
        console.log('[voice] microphone in use:', label);

        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AC();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        meterTimer = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          const lv = Math.min(1, peak / 64);
          if (Math.abs(lv - lastLevel) > 0.05) {
            lastLevel = lv;
            setLevel(lv);
          }
        }, 100);
        return true;
      } catch (err) {
        const name = (err as { name?: string }).name ?? 'Error';
        console.warn('[voice] getUserMedia failed:', name, err);
        if (name === 'NotAllowedError') {
          setError('Microphone blocked. Click the lock icon in the address bar, set Microphone to Allow, then reload.');
        } else if (name === 'NotFoundError') {
          setError('No microphone found. Plug one in or pick it in Windows Sound settings.');
        } else if (name === 'NotReadableError') {
          setError('The microphone is busy in another app (Teams, WhatsApp, etc.). Close it and reload.');
        } else {
          setError(`Microphone error: ${name}`);
        }
        return false;
      }
    };

    // ── 2) speech recognition ──
    const startRec = () => {
      if (stopped || !rec) return;
      try {
        startedAt = Date.now();
        rec.start();
        setListening(true);
      } catch (err) {
        console.log('[voice] start() failed, retrying', err);
        restartTimer = setTimeout(startRec, 600);
      }
    };

    const setupRec = () => {
      rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;

      rec.onstart = () => console.log('[voice] engine started');
      rec.onaudiostart = () => console.log('[voice] recognizer is receiving audio');
      rec.onsoundstart = () => console.log('[voice] sound detected');
      rec.onspeechstart = () => console.log('[voice] speech detected');

      rec.onresult = (e) => {
        gotResult = true;
        let text = '';
        let isFinal = false;
        const found = new Set<VoiceCommand>();
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          text += r[0].transcript + ' ';
          if (r.isFinal) isFinal = true;
          for (let a = 0; a < r.length; a++) {
            const c = parse(r[a].transcript);
            if (c) found.add(c);
          }
        }
        text = text.trim();
        setTranscript(text);
        setError(null);
        console.log('[voice] heard:', text, isFinal ? '(final)' : '(partial)');

        const cmd = PRIORITY.find((c) => found.has(c)) ?? null;
        if (!cmd) return;
        if (pending) clearTimeout(pending);
        if (isFinal) fire(cmd, text);
        else pending = setTimeout(() => fire(cmd, text), 600);
      };

      rec.onerror = (e) => {
        console.warn('[voice] error:', e.error);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          stopped = true;
          setError('Speech recognition blocked. Allow the microphone for localhost in Chrome, then reload.');
        } else if (e.error === 'network') {
          setError('Chrome cannot reach its speech service (needs internet; VPN/firewall can block it). Use the O key meanwhile.');
        } else if (e.error === 'audio-capture') {
          setError('Speech engine cannot capture audio. Check the Windows input device.');
        }
      };

      rec.onend = () => {
        console.log('[voice] engine ended');
        setListening(false);
        if (stopped) return;
        // back off if it keeps ending immediately (something else is using the mic)
        quickEnds = Date.now() - startedAt < 1500 ? quickEnds + 1 : 0;
        const delay = Math.min(300 * (quickEnds + 1), 3000);
        restartTimer = setTimeout(startRec, delay);
      };

      startRec();
    };

    // wait a moment first: avoids the start/abort clash from React double-mounting
    const boot = setTimeout(async () => {
      if (stopped) return;
      const ok = await startMeter();
      if (stopped) return;
      if (ok) setError(null);
      setupRec();
    }, 400);

    const watchdog = setTimeout(() => {
      if (!stopped && !gotResult) {
        console.warn('[voice] no speech result after 10 s');
      }
    }, 10000);

    return () => {
      stopped = true;
      clearTimeout(boot);
      clearTimeout(watchdog);
      if (pending) clearTimeout(pending);
      if (restartTimer) clearTimeout(restartTimer);
      if (meterTimer) clearInterval(meterTimer);
      if (rec) {
        rec.onend = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onstart = null;
        rec.onaudiostart = null;
        rec.onsoundstart = null;
        rec.onspeechstart = null;
        try { rec.abort(); } catch { /* ignore */ }
      }
      stream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close().catch(() => {});
      setListening(false);
      setLevel(0);
    };
  }, [enabled, lang]);

  return { supported, listening, transcript, error, level };
}