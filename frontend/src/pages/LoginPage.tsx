import { useCallback, useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Lock, User, Eye, EyeOff, Loader2, Users, ShieldCheck,
  RefreshCw, LogIn, Megaphone, BarChart3, MonitorSmartphone, LineChart,
  Moon, BadgeCheck,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

/* Drop your real assets in `frontend/public/` and they are picked up automatically:
 *   public/nbpdcl-logo.png  → official emblem (falls back to the bolt mark)
 *   public/login-hero.jpg   → hero photograph (falls back to the CSS scene below)
 */
const LOGO_SRC = '/nbpdcl-logo.png';
const HERO_SRC = '/login-hero.jpg';

const ROLES = ['Administrator', 'Energy Accounting Officer', 'Circle User', 'Division User', 'Auditor / Viewer'];

/** Draws a 4-digit challenge with noise into a canvas. */
function useCaptcha() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [code, setCode] = useState('');

  const draw = useCallback((value: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(0, 0, w, h);

    // speckle noise
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(100,116,139,${Math.random() * 0.45})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    // crossing lines
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(148,163,184,${0.35 + Math.random() * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h);
      ctx.lineTo(Math.random() * w, Math.random() * h);
      ctx.stroke();
    }
    // digits
    const palette = ['#1D4ED8', '#0F766E', '#B45309', '#BE123C', '#4338CA'];
    const step = w / (value.length + 1);
    value.split('').forEach((ch, i) => {
      ctx.save();
      ctx.translate(step * (i + 1) - 4, h / 2 + 8);
      ctx.rotate((Math.random() - 0.5) * 0.5);
      ctx.font = `700 ${24 + Math.random() * 5}px Inter, sans-serif`;
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  }, []);

  const refresh = useCallback(() => {
    const next = String(Math.floor(1000 + Math.random() * 9000));
    setCode(next);
    // canvas may not be mounted on the very first tick
    requestAnimationFrame(() => draw(next));
  }, [draw]);

  useEffect(() => { refresh(); }, [refresh]);

  return { canvasRef, code, refresh };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [heroOk, setHeroOk] = useState(true);
  const [logoOk, setLogoOk] = useState(true);

  const { canvasRef, code, refresh } = useCaptcha();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setNotice(null);

    if (!role) {
      setLocalError('Please select a role to continue.');
      return;
    }
    if (captchaInput.trim() !== code) {
      setLocalError('The captcha you entered is incorrect.');
      setCaptchaInput('');
      refresh();
      return;
    }

    // Credentials are verified by the FastAPI /auth/login endpoint (JWT) — the
    // page never decides on its own whether a login is valid.
    const success = await login(username, password);
    if (success) {
      // The backend contract accepts username + password only. The selected role
      // is kept client-side as session context; it is NOT an authorisation decision.
      localStorage.setItem('nbpdcl_role', role);
      navigate('/dashboard/purchase');
    } else {
      setCaptchaInput('');
      refresh();
    }
  };

  const shownError = localError || error;

  const t = useMemo(() => ({
    card: dark ? '#0F1D33' : '#FFFFFF',
    field: dark ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
    fieldBorder: dark ? 'rgba(148,163,184,0.28)' : '#E2E8F0',
    text: dark ? '#E8EEFB' : '#0F172A',
    muted: dark ? '#94A3B8' : '#64748B',
    heading: dark ? '#7DB6F5' : '#1D4ED8',
    outlineBtn: dark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
  }), [dark]);

  return (
    <div className="min-h-screen w-full relative overflow-hidden" style={{ background: dark ? '#050B18' : '#0B3C7A' }}>
      {/* ---------------------------------------------------------- HERO ---- */}
      <div className="absolute inset-0">
        {heroOk ? (
          <img
            src={HERO_SRC}
            alt=""
            onError={() => setHeroOk(false)}
            className="w-full h-full object-cover"
          />
        ) : (
          /* Fallback scene — sunset sky, river and transmission towers, in pure CSS/SVG */
          <div className="w-full h-full" style={{
            background: dark
              ? 'linear-gradient(180deg,#071429 0%,#0B2444 42%,#123A63 70%,#0A1E38 100%)'
              : 'linear-gradient(180deg,#1E63B8 0%,#4E9AD8 34%,#EFA45C 66%,#C4763C 82%,#2E5C86 100%)',
          }}>
            <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
              <defs>
                <radialGradient id="sun" cx="52%" cy="70%" r="16%">
                  <stop offset="0%" stopColor={dark ? '#274B77' : '#FFE7B8'} />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
                <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
                  <stop offset="35%" stopColor="#22D3EE" stopOpacity="0.95" />
                  <stop offset="70%" stopColor="#4ADE80" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#4ADE80" stopOpacity="0" />
                </linearGradient>
                {/* soft bloom so the wave reads as light, not paint */}
                <filter id="bloom" x="-10%" y="-60%" width="120%" height="220%">
                  <feGaussianBlur stdDeviation="6" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="bloomSoft" x="-10%" y="-60%" width="120%" height="220%">
                  <feGaussianBlur stdDeviation="12" />
                </filter>
              </defs>

              <circle cx="620" cy="560" r="230" fill="url(#sun)" />

              {/* ---- transmission line: towers + catenary conductors ---------- */}
              {(() => {
                const wire = dark ? '#0A1526' : '#233648';
                const ground = 600;
                // tower centres, receding into the distance
                const towers = [140, 330, 500, 645, 758].map((x, i) => ({
                  x,
                  s: 1 - i * 0.15,          // perspective scale
                  h: 300 * (1 - i * 0.15),
                }));

                /** Conductor between two towers, hanging with a realistic sag. */
                const conductor = (a: typeof towers[0], b: typeof towers[0], armY: number, spread: number) => {
                  const x1 = a.x + spread * a.s;
                  const y1 = ground - a.h * armY;
                  const x2 = b.x - spread * b.s;
                  const y2 = ground - b.h * armY;
                  // sag scales with span length — longer span, deeper droop
                  const sag = (x2 - x1) * 0.13;
                  const cx = (x1 + x2) / 2;
                  const cy = (y1 + y2) / 2 + sag;
                  return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
                };

                // three conductor levels, matching the cross-arm heights
                const arms: [number, number][] = [[0.72, 52], [0.88, 40], [0.52, 22]];

                return (
                  <g>
                    {/* conductors drawn behind the towers */}
                    <g stroke={wire} fill="none" opacity={0.75}>
                      {towers.slice(0, -1).map((t, i) =>
                        arms.map(([armY, spread], j) => (
                          <path
                            key={`${i}-${j}`}
                            d={conductor(t, towers[i + 1], armY, spread)}
                            strokeWidth={1.3 * t.s}
                          />
                        ))
                      )}
                      {/* leader spans running off both edges of the frame */}
                      <path d={conductor({ x: -70, s: 1.05, h: 315 } as any, towers[0], 0.72, 52)} strokeWidth={1.4} />
                      <path d={conductor({ x: -70, s: 1.05, h: 315 } as any, towers[0], 0.88, 40)} strokeWidth={1.4} />
                      <path d={conductor(towers[towers.length - 1], { x: 900, s: 0.3, h: 90 } as any, 0.72, 52)} strokeWidth={0.8} />
                    </g>

                    {/* towers */}
                    {towers.map((t, i) => {
                      const { x, s, h } = t;
                      const y = ground;
                      return (
                        <g key={x} stroke={wire} strokeWidth={2 * s} fill="none" opacity={0.92 - i * 0.1}>
                          {/* legs */}
                          <path d={`M${x - 42 * s} ${y} L${x} ${y - h} L${x + 42 * s} ${y}`} />
                          <path d={`M${x - 42 * s} ${y} L${x + 42 * s} ${y}`} />
                          {/* lattice bracing */}
                          {[0.18, 0.36, 0.54, 0.72].map((f, k) => {
                            const w = 42 * s * (1 - f);
                            const yy = y - h * f;
                            return <path key={k} d={`M${x - w} ${yy} L${x + w} ${yy}`} strokeWidth={1.2 * s} />;
                          })}
                          <path d={`M${x - 42 * s} ${y} L${x + 30 * s} ${y - h * 0.36} M${x + 42 * s} ${y} L${x - 30 * s} ${y - h * 0.36}`} strokeWidth={1 * s} opacity={0.7} />
                          {/* cross-arms — the conductors attach at these tips */}
                          {arms.map(([armY, spread], k) => {
                            const yy = y - h * armY;
                            return (
                              <g key={k}>
                                <path d={`M${x - spread * s} ${yy} L${x + spread * s} ${yy}`} strokeWidth={1.6 * s} />
                                {/* insulator strings */}
                                <path d={`M${x - spread * s} ${yy} l0 ${7 * s} M${x + spread * s} ${yy} l0 ${7 * s}`} strokeWidth={1.1 * s} />
                              </g>
                            );
                          })}
                          {/* peak */}
                          <path d={`M${x} ${y - h} l0 ${-8 * s}`} strokeWidth={1.4 * s} />
                        </g>
                      );
                    })}
                  </g>
                );
              })()}

              {/* water */}
              <rect x="0" y="600" width="1200" height="200" fill={dark ? '#08182E' : '#8A6E63'} opacity="0.55" />

              {/* ---- energy waves: glowing, drifting current ------------------ */}
              <g filter="url(#bloom)">
                <path
                  d="M-260 660 C 40 585, 180 725, 480 645 S 940 560, 1240 630 S 1700 700, 2000 640"
                  stroke="url(#glow)" strokeWidth="4.5" fill="none" strokeLinecap="round"
                >
                  <animateTransform attributeName="transform" type="translate"
                    from="0 0" to="1260 0" dur="9s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.55;1;0.55" dur="3.4s" repeatCount="indefinite" />
                </path>
                <path
                  d="M-260 694 C 60 640, 230 768, 540 686 S 980 612, 1240 668 S 1720 740, 2000 676"
                  stroke="url(#glow)" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.6"
                >
                  <animateTransform attributeName="transform" type="translate"
                    from="0 0" to="1260 0" dur="13s" repeatCount="indefinite" />
                </path>
              </g>
              {/* wide underglow — the light the wave throws onto the water */}
              <path
                d="M-260 668 C 40 596, 180 733, 480 653 S 940 568, 1240 638 S 1700 708, 2000 648"
                stroke="url(#glow)" strokeWidth="16" fill="none" opacity="0.2" filter="url(#bloomSoft)"
              >
                <animateTransform attributeName="transform" type="translate"
                  from="0 0" to="1260 0" dur="9s" repeatCount="indefinite" />
              </path>
            </svg>
          </div>
        )}
        {/* readability wash */}
        <div className="absolute inset-0" style={{
          background: dark
            ? 'linear-gradient(90deg, rgba(3,8,18,0.86) 0%, rgba(3,8,18,0.55) 45%, rgba(3,8,18,0.3) 100%)'
            : 'linear-gradient(90deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.35) 32%, rgba(10,40,80,0.15) 60%, rgba(10,40,80,0.05) 100%)',
        }} />
      </div>

      {/* --------------------------------------------------- DARK TOGGLE ---- */}
      <button
        type="button"
        onClick={() => setDark((d) => !d)}
        className="absolute top-6 right-8 z-20 flex items-center gap-2.5 group"
        aria-label="Toggle dark mode"
      >
        <Moon size={17} style={{ color: dark ? '#E8EEFB' : '#1E293B' }} />
        <span className="text-sm font-medium" style={{ color: dark ? '#E8EEFB' : '#1E293B' }}>Dark Mode</span>
        <span
          className="w-11 h-6 rounded-full relative transition-colors duration-200"
          style={{ background: dark ? '#2563EB' : 'rgba(255,255,255,0.85)', boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.12)' }}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
            style={{ left: dark ? 22 : 2 }}
          />
        </span>
      </button>

      {/* ------------------------------------------------------- CONTENT ---- */}
      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_560px] gap-8 px-8 lg:px-14 pt-7 pb-4">

          {/* ============ LEFT: branding ============ */}
          <div className="hidden lg:flex flex-col">
            {/* Emblem + wordmark */}
            <div className="flex items-center gap-3.5">
              {logoOk ? (
                <img src={LOGO_SRC} alt="NBPDCL" onError={() => setLogoOk(false)} className="w-16 h-16 object-contain" />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center border-2"
                  style={{ borderColor: dark ? '#7DB6F5' : '#1D4ED8', background: dark ? 'rgba(125,182,245,0.12)' : 'rgba(255,255,255,0.75)' }}>
                  <Zap size={28} style={{ color: dark ? '#7DB6F5' : '#1D4ED8' }} />
                </div>
              )}
              <div>
                <div className="text-[34px] font-extrabold leading-none tracking-tight" style={{ color: dark ? '#E8EEFB' : '#0B2E62' }}>
                  NBPDCL
                </div>
                <div className="text-[11px] font-medium mt-1" style={{ color: dark ? '#94A3B8' : '#33507F' }}>
                  A Government of Bihar Undertaking
                </div>
              </div>
            </div>

            {/* Tagline */}
            <div className="mt-16">
              <h1 className="text-[40px] leading-[1.12] font-light" style={{ color: dark ? '#E8EEFB' : '#0B2E62' }}>
                Powering Progress<br />Energizing Bihar
              </h1>
              <div className="w-16 h-1 rounded-full mt-5" style={{ background: '#F5A524' }} />
            </div>

            {/* Feature list */}
            <div className="mt-9 space-y-4">
              {[
                { Icon: BarChart3, label: 'Energy Accounting' },
                { Icon: MonitorSmartphone, label: 'Real-time Monitoring' },
                { Icon: LineChart, label: 'Insightful Reporting' },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex items-center gap-3.5">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border"
                    style={{
                      background: dark ? 'rgba(125,182,245,0.12)' : 'rgba(255,255,255,0.85)',
                      borderColor: dark ? 'rgba(125,182,245,0.35)' : 'rgba(29,78,216,0.25)',
                      color: dark ? '#7DB6F5' : '#1D4ED8',
                    }}>
                    <Icon size={16} />
                  </span>
                  <span className="text-[15px] font-medium" style={{ color: dark ? '#CBD5E1' : '#173A6B' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Announcement banner */}
            <div className="mt-auto mb-2 max-w-[430px] rounded-xl p-4 flex items-start gap-3 backdrop-blur-sm"
              style={{ background: dark ? 'rgba(8,18,36,0.75)' : 'rgba(12,32,60,0.78)', border: '1px solid rgba(148,163,184,0.2)' }}>
              <Megaphone size={20} style={{ color: '#F5A524' }} className="shrink-0 mt-0.5" />
              <div>
                <div className="text-[14px] font-semibold text-white">Welcome to Energy Accounting Dashboard</div>
                <div className="text-[12.5px] mt-0.5" style={{ color: '#B6C6DE' }}>Track. Analyze. Optimize.</div>
                <div className="text-[12.5px]" style={{ color: '#B6C6DE' }}>Together for a stronger &amp; brighter Bihar.</div>
              </div>
            </div>
          </div>

          {/* ============ RIGHT: login card ============ */}
          <div className="flex items-center justify-center lg:justify-end">
            <div
              className="w-full max-w-[452px] rounded-2xl px-9 py-8"
              style={{
                background: t.card,
                boxShadow: '0 24px 60px -12px rgba(3,15,40,0.45)',
                border: dark ? '1px solid rgba(148,163,184,0.16)' : '1px solid rgba(226,232,240,0.9)',
              }}
            >
              {/* Bolt badge */}
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: dark ? 'rgba(245,165,36,0.14)' : '#EFF6FF' }}>
                  <Zap size={26} style={{ color: '#F5A524', fill: '#F5A524' }} />
                </div>
              </div>

              <h2 className="text-[26px] font-bold text-center mt-3" style={{ color: t.heading }}>Welcome Back!</h2>
              <p className="text-[13px] text-center mt-1.5" style={{ color: t.muted }}>
                Login to your NBPDCL Energy Accounting Dashboard
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-3">
                {/* User ID */}
                <Field icon={User} theme={t}>
                  <input
                    type="text" required value={username} autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="User ID / Employee ID"
                    className="w-full bg-transparent outline-none text-[14px]"
                    style={{ color: t.text }}
                  />
                </Field>

                {/* Password */}
                <Field icon={Lock} theme={t}>
                  <input
                    type={showPassword ? 'text' : 'password'} required value={password} autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-transparent outline-none text-[14px]"
                    style={{ color: t.text }}
                  />
                  <button type="button" onClick={() => setShowPassword((s) => !s)} className="shrink-0" style={{ color: t.muted }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </Field>

                {/* Login As */}
                <FloatingSelect
                  icon={Users} label="Login As" theme={t}
                  value={role} onChange={setRole} options={ROLES} placeholder="Select Role"
                />

                {/* Captcha */}
                <div className="flex items-stretch gap-2">
                  <div className="flex-1 min-w-0">
                    <Field icon={ShieldCheck} theme={t}>
                      <input
                        type="text" required value={captchaInput} inputMode="numeric" autoComplete="off"
                        onChange={(e) => setCaptchaInput(e.target.value)}
                        placeholder="Enter Captcha"
                        className="w-full bg-transparent outline-none text-[14px]"
                        style={{ color: t.text }}
                      />
                    </Field>
                  </div>
                  <canvas
                    ref={canvasRef} width={110} height={46}
                    className="rounded-xl shrink-0"
                    style={{ border: `1px solid ${t.fieldBorder}` }}
                    aria-label="Captcha image"
                  />
                  <button
                    type="button" onClick={() => { setCaptchaInput(''); refresh(); }}
                    className="w-11 rounded-xl flex items-center justify-center shrink-0 transition hover:opacity-80"
                    style={{ background: t.field, border: `1px solid ${t.fieldBorder}`, color: t.muted }}
                    aria-label="Refresh captcha"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>

                {shownError && (
                  <div className="text-[12.5px] rounded-lg px-3 py-2"
                    style={{ color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}>
                    {shownError}
                  </div>
                )}
                {notice && (
                  <div className="text-[12.5px] rounded-lg px-3 py-2"
                    style={{ color: '#B45309', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    {notice}
                  </div>
                )}

                {/* Login */}
                <button
                  type="submit" disabled={loading}
                  className="w-full h-[46px] rounded-xl text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition disabled:opacity-60 hover:brightness-110"
                  style={{ background: '#1B8A3C', boxShadow: '0 6px 16px -6px rgba(27,138,60,0.7)' }}
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                  {loading ? 'Signing in…' : 'Login'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setNotice('Password resets are handled by the NBPDCL IT helpdesk — no self-service reset is configured yet.')}
                className="block mx-auto mt-3.5 text-[12.5px] font-semibold hover:underline"
                style={{ color: dark ? '#7DB6F5' : '#1D4ED8' }}
              >
                Forgot Password?
              </button>

            </div>
          </div>
        </div>

        {/* -------------------------------------------------------- FOOTER --- */}
        <div className="px-8 lg:px-14 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: dark ? '#94A3B8' : '#1E3A63' }}>
            <BadgeCheck size={14} />
            <span>NBPDCL</span>
            <Sep dark={dark} /><span>BSPHCL</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[12.5px]" style={{ color: dark ? '#94A3B8' : '#1E3A63' }}>
            <ShieldCheck size={14} />
            <span>Version 1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- pieces --- */

type Theme = { card: string; field: string; fieldBorder: string; text: string; muted: string; heading: string; outlineBtn: string };

function Sep({ dark }: { dark: boolean }) {
  return <span style={{ color: dark ? '#475569' : '#7F9AC0' }}>|</span>;
}

function Field({ icon: Icon, theme, children }: { icon: any; theme: Theme; children: React.ReactNode }) {
  return (
    <div
      className="h-[46px] rounded-xl px-3.5 flex items-center gap-2.5 transition focus-within:ring-2"
      style={{ background: theme.field, border: `1px solid ${theme.fieldBorder}`, ['--tw-ring-color' as any]: 'rgba(37,99,235,0.25)' }}
    >
      <Icon size={17} style={{ color: theme.muted }} className="shrink-0" />
      {children}
    </div>
  );
}

function FloatingSelect({
  icon: Icon, label, value, onChange, options, placeholder, theme,
}: {
  icon: any; label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; theme: Theme;
}) {
  return (
    <div
      className="h-[52px] rounded-xl px-3.5 flex items-center gap-2.5 transition focus-within:ring-2"
      style={{ background: theme.field, border: `1px solid ${theme.fieldBorder}`, ['--tw-ring-color' as any]: 'rgba(37,99,235,0.25)' }}
    >
      <Icon size={17} style={{ color: theme.muted }} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] leading-none" style={{ color: theme.muted }}>{label}</div>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent outline-none text-[14px] font-medium mt-0.5 -ml-0.5"
          style={{ color: value ? theme.text : theme.muted }}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );
}

