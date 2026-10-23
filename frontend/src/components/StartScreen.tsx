/**
 * MIRAI — StartScreen
 *
 * Shown over the live mirror right after the app starts. Two options:
 *   1. GENERATE QR  -> QR code that opens the dashboard on the customer's phone
 *   2. VOICE ACCESS -> microphone listens; saying "open" opens the dashboard on the mirror
 *
 * QR troubleshooting built in: shows the exact link, lets you pick another network address
 * if the PC has several, and explains what to check when the phone has not connected.
 */
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LayoutDashboard, Mic, MicOff, QrCode, Smartphone, X } from 'lucide-react';
import { API_BASE } from '../config/api';

interface VoiceInfo {
  supported: boolean;
  listening: boolean;
  transcript: string;
  error: string | null;
}

interface Props {
  pairId: string;
  voice: VoiceInfo;
  voiceOn: boolean;
  onToggleVoice: () => void;
  /** go straight to the mirror (QR scanned, or "Skip") */
  onContinue: () => void;
  onOpenDashboard: () => void;
  /** mirror view + dashboard panel together (same as saying "open") */
  onOpenAll: () => void;
}

const FIXED_BASE = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const ON_LOCALHOST = ['localhost', '127.0.0.1'].includes(window.location.hostname);
/** Only when the mirror itself is opened as "localhost" must the backend tell us the PC's LAN address. */
const NEEDS_LAN_IP = !FIXED_BASE && ON_LOCALHOST;

/** The URL the PHONE must open ("localhost" on a phone would mean the phone itself). */
function buildPhoneUrl(pairId: string, ip: string): string | null {
  let base = FIXED_BASE;
  if (!base) {
    if (ON_LOCALHOST) {
      if (!ip) return null;
      const port = window.location.port ? `:${window.location.port}` : '';
      base = `${window.location.protocol}//${ip}${port}`;
    } else {
      base = window.location.origin;
    }
  }
  return `${base}/?dashboard=${pairId}`;
}

export const StartScreen: React.FC<Props> = ({
  pairId,
  voice,
  voiceOn,
  onToggleVoice,
  onContinue,
  onOpenDashboard,
  onOpenAll,
}) => {
  const [showQr, setShowQr] = useState(false);
  const [ips, setIps] = useState<string[]>([]);
  const [ip, setIp] = useState('');
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [phoneUrl, setPhoneUrl] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [waitedLong, setWaitedLong] = useState(false);

  const continueRef = useRef(onContinue);
  continueRef.current = onContinue;

  // 1) Ask the backend for this PC's network addresses (only needed on localhost)
  useEffect(() => {
    if (!showQr || !NEEDS_LAN_IP) return;
    let cancelled = false;
    setQrError(null);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/dashboard/lan-info`);
        if (!res.ok) throw new Error('lan-info failed');
        const d = (await res.json()) as { ip: string; all?: string[] };
        if (cancelled) return;
        setIps(d.all && d.all.length ? d.all : [d.ip]);
        setIp((prev) => prev || d.ip);
      } catch {
        if (!cancelled) setQrError('Could not reach the backend on port 8000. Is uvicorn running?');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showQr]);

  // 2) Build the QR image whenever the address changes
  useEffect(() => {
    if (!showQr) return;
    const url = buildPhoneUrl(pairId, ip);
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 300, margin: 1 })
      .then((img) => {
        if (!cancelled) {
          setPhoneUrl(url);
          setQrImg(img);
        }
      })
      .catch(() => {
        if (!cancelled) setQrError('Could not draw the QR code.');
      });
    return () => {
      cancelled = true;
    };
  }, [showQr, pairId, ip]);

  // 3) Watch for the phone opening the dashboard (+ show help if it takes too long)
  useEffect(() => {
    if (!showQr) return;
    let alive = true;
    let moved = false;
    setPhoneConnected(false);
    setWaitedLong(false);

    const helpTimer = setTimeout(() => alive && setWaitedLong(true), 15000);
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/dashboard/${pairId}/status`);
        if (!res.ok || !alive) return;
        const d = (await res.json()) as { mobile_connected: boolean };
        if (d.mobile_connected && alive) {
          setPhoneConnected(true);
          if (!moved) {
            moved = true;
            setTimeout(() => alive && continueRef.current(), 1800);
          }
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearTimeout(helpTimer);
      clearInterval(id);
    };
  }, [showQr, pairId]);

  const phoneHost = phoneUrl ? new URL(phoneUrl).hostname : '';

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-md p-6 overflow-y-auto">
      <div className="w-full max-w-3xl text-white">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-widest">MIRAI</h1>
          <p className="text-neutral-300 mt-2">How would you like to continue?</p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* ── Option 1: QR ── */}
          <div className="rounded-3xl bg-white/10 border border-white/15 p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/25 flex items-center justify-center mb-3">
              <QrCode size={28} className="text-violet-300" />
            </div>
            <h2 className="text-xl font-bold">Generate QR</h2>
            <p className="text-sm text-neutral-300 mt-1">
              Scan with your phone to open the dashboard there.
            </p>

            {!showQr ? (
              <button
                onClick={() => setShowQr(true)}
                className="mt-5 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold transition-all active:scale-95"
              >
                Generate QR
              </button>
            ) : (
              <div className="mt-4 flex flex-col items-center w-full">
                {qrError ? (
                  <p className="text-amber-300 text-sm max-w-xs">{qrError}</p>
                ) : qrImg ? (
                  <>
                    <img src={qrImg} alt="Dashboard QR code" className="w-56 h-56 rounded-xl bg-white p-2" />
                    <p className="mt-2 text-[11px] text-neutral-300 break-all max-w-xs">{phoneUrl}</p>

                    {ips.length > 1 && (
                      <label className="mt-2 text-[11px] text-neutral-400 flex items-center gap-2">
                        Network address
                        <select
                          value={ip}
                          onChange={(e) => setIp(e.target.value)}
                          className="px-2 py-1 rounded-md bg-white/10 border border-white/15 text-white"
                        >
                          {ips.map((a) => (
                            <option key={a} value={a} className="text-black">
                              {a}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {phoneConnected ? (
                      <p className="mt-3 flex items-center gap-2 text-emerald-300 font-semibold">
                        <Smartphone size={16} /> Phone connected
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-300">
                        Waiting for your phone… (same Wi-Fi as the mirror)
                      </p>
                    )}

                    {waitedLong && !phoneConnected && (
                      <div className="mt-3 text-left text-[12px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 max-w-xs space-y-1">
                        <p className="font-semibold">Phone not connecting? Check:</p>
                        <p>1. Phone is on the same Wi-Fi (not mobile data, not a guest network).</p>
                        <p>
                          2. On the phone browser, type <b>http://{phoneHost}:{window.location.port || '5173'}</b>.
                          Page opens? Then it is the backend: run uvicorn with <b>--host 0.0.0.0</b>.
                        </p>
                        <p>3. Page does not open? Allow ports 5173 and 8000 in Windows Firewall.</p>
                        {ips.length > 1 && <p>4. Try another network address from the list above.</p>}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-neutral-400 text-sm">Creating QR…</p>
                )}
                <button
                  onClick={() => {
                    setShowQr(false);
                    setQrImg(null);
                  }}
                  className="mt-3 text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                >
                  <X size={12} /> Hide
                </button>
              </div>
            )}
          </div>

          {/* ── Option 2: Voice access ── */}
          <div className="rounded-3xl bg-white/10 border border-white/15 p-6 flex flex-col items-center text-center">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
                voiceOn && voice.listening ? 'bg-emerald-500/30 animate-pulse' : 'bg-emerald-500/20'
              }`}
            >
              {voiceOn ? (
                <Mic size={28} className="text-emerald-300" />
              ) : (
                <MicOff size={28} className="text-emerald-300" />
              )}
            </div>
            <h2 className="text-xl font-bold">Voice access</h2>
            <p className="text-sm text-neutral-300 mt-1">
              Say <b className="text-white">“open”</b> and the mirror and dashboard open together.
            </p>

            {!voice.supported ? (
              <p className="mt-4 text-amber-300 text-sm">
                This browser has no speech recognition. Use Chrome or Edge.
              </p>
            ) : !voiceOn ? (
              <button
                onClick={onToggleVoice}
                className="mt-5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold transition-all active:scale-95"
              >
                Start voice access
              </button>
            ) : (
              <div className="mt-4 w-full">
                <p className="text-emerald-300 font-semibold">
                  {voice.listening ? 'Listening… say “open”' : 'Starting microphone…'}
                </p>
                <p className="mt-2 min-h-[2.5rem] text-sm text-neutral-300 italic">
                  {voice.transcript ? `“${voice.transcript}”` : ''}
                </p>
                {voice.error && <p className="text-amber-300 text-sm">{voice.error}</p>}
                <div className="mt-2 flex gap-2 justify-center">
                  <button
                    onClick={onOpenAll}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
                  >
                    Open all
                  </button>
                  <button
                    onClick={onOpenDashboard}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold flex items-center gap-1.5"
                  >
                    <LayoutDashboard size={14} /> Dashboard
                  </button>
                  <button
                    onClick={onToggleVoice}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm"
                  >
                    Stop mic
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          <button onClick={onContinue} className="text-sm text-neutral-300 hover:text-white underline">
            Skip and use the mirror
          </button>
        </div>
      </div>
    </div>
  );
};

export default StartScreen;