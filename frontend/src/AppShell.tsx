/**
 * MIRAI — AppShell with real page URLs (no extra dependency)
 *
 *   /                 -> Start page (QR + Voice access)  — the ONLY page where the mic listens
 *   /mirror           -> Mirror only                      (mic off, Back button)
 *   /open             -> Mirror + dashboard side panel    (mic off, Back button)
 *   /dashboard        -> Full-screen dashboard            (mic off, Back button)
 *   /?dashboard=<id>  -> PHONE view (from the QR code)
 *
 * The mirror stays mounted on every page (hidden on / and /dashboard), so the
 * camera and measuring keep running and the dashboard always has live data.
 *
 * Voice (start page only): "open", "dashboard", "mirror", "menu"
 * Keyboard: O = open, D = dashboard, M / Esc = mirror, H = start page
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Mic } from 'lucide-react';
import { MirrorViewV2 } from './components/MirrorViewV2';
import { StartScreen } from './components/StartScreen';
import { DashboardPage } from './components/DashboardPage';
import { PhoneApp } from './components/Phoneapp';
import { useVoiceCommand } from './hooks/useVoiceCommand';
import type { VoiceCommand } from './hooks/useVoiceCommand';

const PAIR_KEY = 'mirai_pair_id';

/* ───────────── tiny router ───────────── */
const ROUTES = ['/', '/mirror', '/open', '/dashboard'] as const;
type Route = (typeof ROUTES)[number];

const normalize = (p: string): string => {
  const x = p.length > 1 ? p.replace(/\/+$/, '') : p;
  return x.toLowerCase() || '/';
};

const navigate = (to: Route) => {
  if (normalize(window.location.pathname) === to) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const usePath = (): Route => {
  const [path, setPath] = useState(() => normalize(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPath(normalize(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // unknown URL -> go to the start page
  useEffect(() => {
    if (!(ROUTES as readonly string[]).includes(path)) {
      window.history.replaceState({}, '', '/');
      setPath('/');
    }
  }, [path]);

  return ((ROUTES as readonly string[]).includes(path) ? path : '/') as Route;
};

const TITLES: Record<Route, string> = {
  '/': 'MIRAI — Start',
  '/mirror': 'MIRAI — Mirror',
  '/open': 'MIRAI — Mirror + Dashboard',
  '/dashboard': 'MIRAI — Dashboard',
};

/* ───────────── helpers ───────────── */
const newPairId = (): string => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
};

const LevelBar: React.FC<{ level: number }> = ({ level }) => (
  <span className="inline-block w-12 h-1.5 rounded-full bg-white/15 overflow-hidden" title="Microphone level">
    <span
      className="block h-full bg-emerald-400 transition-all duration-100"
      style={{ width: `${Math.round(level * 100)}%` }}
    />
  </span>
);

const BackButton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <button
    onClick={() => navigate('/')}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 border border-white/20 text-white text-xs font-semibold backdrop-blur hover:bg-black/90 active:scale-95 transition-all ${className}`}
    title="Back to QR / voice access"
  >
    <ArrowLeft size={14} /> Back
  </button>
);

/* ───────────── mirror device ───────────── */
const MirrorApp: React.FC = () => {
  const route = usePath();

  const [pairId] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(PAIR_KEY);
      if (saved) return saved;
      const id = newPairId();
      sessionStorage.setItem(PAIR_KEY, id);
      return id;
    } catch {
      return newPairId();
    }
  });

  // Voice is ON only on the start page. It switches off on every other page and
  // switches on again automatically when you come back to the start page.
  const [voiceOn, setVoiceOn] = useState(route === '/');

  useEffect(() => {
    setVoiceOn(route === '/');
    document.title = TITLES[route];
  }, [route]);

  const onCommand = useCallback((cmd: VoiceCommand) => {
    if (cmd === 'open') navigate('/open');
    else if (cmd === 'dashboard') navigate('/dashboard');
    else if (cmd === 'menu') navigate('/');
    else navigate('/mirror');
  }, []);

  const voice = useVoiceCommand({ enabled: voiceOn, onCommand });

  // keyboard fallback (works on every page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'o') onCommand('open');
      else if (k === 'd') onCommand('dashboard');
      else if (k === 'm' || k === 'escape') onCommand('mirror');
      else if (k === 'h') onCommand('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCommand]);

  const mirrorVisible = route === '/mirror' || route === '/open';

  return (
    <div className="relative w-full h-full bg-black">
      {/* Mirror always mounted (camera + measuring keep running); only hidden on other pages */}
      <div className={`absolute inset-0 ${mirrorVisible ? '' : 'invisible pointer-events-none'}`}>
        <MirrorViewV2 pairId={pairId} />
      </div>

      {/* PAGE: /  (QR + voice access) */}
      {route === '/' && (
        <>
          <StartScreen
            pairId={pairId}
            voice={voice}
            voiceOn={voiceOn}
            onToggleVoice={() => setVoiceOn((v) => !v)}
            onContinue={() => navigate('/mirror')}
            onOpenDashboard={() => navigate('/dashboard')}
            onOpenAll={() => navigate('/open')}
          />
          {voiceOn && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[75] flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 border border-white/15 text-xs text-neutral-300">
              <Mic size={13} className={voice.listening ? 'animate-pulse text-emerald-300' : ''} />
              <LevelBar level={voice.level} />
              Mic level · press <b className="text-white">O</b> to open
            </div>
          )}
        </>
      )}

      {/* PAGE: /dashboard */}
      {route === '/dashboard' && (
        <>
          <DashboardPage pairId={pairId} embedded onClose={() => navigate('/mirror')} />
          <BackButton className="fixed top-4 left-4 z-[90]" />
        </>
      )}

      {/* PAGE: /open  (dashboard panel docked on the mirror) */}
      {route === '/open' && (
        <DashboardPage pairId={pairId} docked onClose={() => navigate('/mirror')} />
      )}

      {/* Controls on /mirror and /open (no mic here) */}
      {mirrorVisible && (
        <div
          className={`absolute bottom-4 z-[60] flex items-center gap-2 ${
            route === '/open' ? 'left-4' : 'left-1/2 -translate-x-1/2'
          }`}
        >
          <BackButton />
          {route === '/mirror' && (
            <button
              onClick={() => navigate('/open')}
              className="px-3 py-1.5 rounded-full bg-emerald-700/80 border border-emerald-400/40 text-white text-xs font-semibold backdrop-blur"
            >
              Open dashboard
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ───────────── entry ───────────── */
export const AppShell: React.FC = () => {
  // PHONE (opened from the QR): works on any path
  const phonePair = new URLSearchParams(window.location.search).get('dashboard');
  if (phonePair) return <PhoneApp pairId={phonePair} />;
  return <MirrorApp />;
};

export default AppShell;