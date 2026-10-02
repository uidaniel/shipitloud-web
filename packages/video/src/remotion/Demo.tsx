import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from 'remotion';
import { useEffect, useState, type CSSProperties } from 'react';
import { T, type DemoProps, type Shot, type VideoTheme } from '../types';

const FONT = 'Geist, system-ui, sans-serif';

export function useFonts() {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const faces = [['Geist-Medium.woff2', '500'], ['Geist-SemiBold.woff2', '600'], ['Geist-Bold.woff2', '700']] as const;
    Promise.all(faces.map(([file, weight]) => new FontFace('Geist', `url(${staticFile(file)})`, { weight }).load().then((f) => document.fonts.add(f))))
      .finally(() => continueRender(handle));
  }, [handle]);
}

/** Fade in at the start and out at the end of a beat. */
function useBeat(length: number) {
  const f = useCurrentFrame();
  return interpolate(f, [0, T.fade, length - T.fade, length], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

export function Words({ text, size, color, delay = 0, weight = 700, align = 'left' }: { text: string; size: number; color: string; delay?: number; weight?: number; align?: 'left' | 'center' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontSize: size, lineHeight: 1.06, letterSpacing: '-0.035em', fontWeight: weight, color, textAlign: align, textWrap: 'balance' } as CSSProperties}>
      {text.split(/\s+/).map((w, i) => {
        const s = spring({ frame: frame - delay - i * 2.5, fps, config: { damping: 200 } });
        return <span key={i} style={{ display: 'inline-block', opacity: s, transform: `translateY(${(1 - s) * 0.35}em)`, marginRight: '0.24em' }}>{w}</span>;
      })}
    </div>
  );
}

export function Brand({ name, logo, theme, size }: { name: string; logo: string | null; theme: VideoTheme; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.45 }}>
      {logo ? <Img src={logo} style={{ width: size * 1.6, height: size * 1.6, borderRadius: size * 0.36, objectFit: 'contain' }} /> : null}
      <span style={{ fontSize: size, fontWeight: 600, letterSpacing: '-0.025em', color: theme.fg }}>{name}</span>
    </div>
  );
}

function Intro({ name, logo, theme }: Pick<DemoProps, 'name' | 'logo' | 'theme'>) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const o = useBeat(T.intro);
  const s = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: o }}>
      <div style={{ transform: `scale(${0.85 + s * 0.15})` }}><Brand name={name} logo={logo} theme={theme} size={Math.round(width * 0.045)} /></div>
    </AbsoluteFill>
  );
}

function Hook({ hook, theme }: Pick<DemoProps, 'hook' | 'theme'>) {
  const { width, height } = useVideoConfig();
  const o = useBeat(T.hook);
  const size = Math.round(Math.min(width, height) * (width > height ? 0.085 : 0.095));
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${Math.round(width * 0.09)}px`, opacity: o }}>
      <Words text={hook} size={size} color={theme.fg} />
    </AbsoluteFill>
  );
}

/** Screenshot in a plain frame; slow push-in and a gentle scroll so stills feel alive. */
function Frame({ src, kind, w, theme }: { src: string; kind: 'browser' | 'phone'; w: number; theme: VideoTheme }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const scroll = interpolate(frame, [18, T.shot - 6], [0, -22], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const zoom = interpolate(frame, [0, T.shot], [1, 1.04]);
  const phone = kind === 'phone';
  const h = phone ? w * 2.05 : w * 0.66;
  const radius = phone ? w * 0.12 : w * 0.018;
  return (
    <div style={{ width: w, height: h, borderRadius: radius, overflow: 'hidden', background: '#fff', transform: `translateY(${(1 - rise) * 80}px) scale(${zoom})`, opacity: rise,
      boxShadow: '0 40px 90px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08)', border: phone ? `${w * 0.025}px solid #15151b` : undefined, display: 'flex', flexDirection: 'column' }}>
      {!phone && (
        <div style={{ height: w * 0.034, background: '#1b1b22', display: 'flex', alignItems: 'center', gap: w * 0.008, padding: `0 ${w * 0.014}px`, flex: 'none' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: w * 0.011, height: w * 0.011, borderRadius: 99, background: c, opacity: 0.85 }} />)}
          <span style={{ marginLeft: w * 0.02, flex: 1, height: w * 0.018, borderRadius: 99, background: 'rgba(255,255,255,.08)' }} />
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden', background: theme.bg }}>
        <Img src={src} style={{ width: '100%', display: 'block', transform: `translateY(${scroll}%)` }} />
      </div>
    </div>
  );
}

function ShotBeat({ shot, theme }: { shot: Shot; theme: VideoTheme }) {
  const { width, height } = useVideoConfig();
  const o = useBeat(T.shot);
  const portrait = height > width * 1.2;
  const landscape = width > height * 1.2;
  // Portrait prefers the phone shot; wide formats prefer desktop.
  const src = portrait ? (shot.mobile ?? shot.desktop) : (shot.desktop ?? shot.mobile);
  const kind: 'browser' | 'phone' = src === shot.mobile && shot.mobile ? 'phone' : 'browser';
  const pad = Math.round(Math.min(width, height) * 0.075);
  const capSize = Math.round(Math.min(width, height) * (landscape ? 0.068 : portrait ? 0.074 : 0.062));
  const frameW = kind === 'phone'
    ? Math.min(width * 0.7, (height * 0.68) / 2.05)
    : landscape ? width * 0.56 : width - pad * 2;

  return (
    <AbsoluteFill style={{ opacity: o, padding: pad, flexDirection: landscape ? 'row' : 'column', alignItems: landscape ? 'center' : 'stretch', justifyContent: 'center', gap: pad * (landscape ? 1 : 0.7) }}>
      <div style={{ flex: landscape ? '0 0 34%' : 'none' }}>
        <Words text={shot.caption} size={capSize} color={theme.fg} delay={2} />
      </div>
      <div style={{ flex: landscape ? 1 : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        {src ? <Frame src={src} kind={kind} w={frameW} theme={theme} /> : null}
      </div>
    </AbsoluteFill>
  );
}

function Cta({ name, logo, host, cta, theme }: Pick<DemoProps, 'name' | 'logo' | 'host' | 'cta' | 'theme'>) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const o = interpolate(frame, [0, T.fade], [0, 1], { extrapolateRight: 'clamp' });
  const m = Math.min(width, height);
  const pill = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: m * 0.05, opacity: o, padding: m * 0.08 }}>
      <Brand name={name} logo={logo} theme={theme} size={Math.round(m * 0.04)} />
      <Words text={cta} size={Math.round(m * 0.08)} color={theme.fg} align="center" delay={4} />
      {host && (
        <div style={{ opacity: pill, transform: `translateY(${(1 - pill) * 20}px)`, background: theme.accent, color: theme.onAccent, fontWeight: 600, fontSize: Math.round(m * 0.036), padding: `${m * 0.018}px ${m * 0.04}px`, borderRadius: 999 }}>{host}</div>
      )}
    </AbsoluteFill>
  );
}

export function Demo(props: DemoProps) {
  useFonts();
  const { theme, shots } = props;
  let at = 0;
  const seq = (len: number) => { const from = at; at += len; return { from, durationInFrames: len }; };
  return (
    <AbsoluteFill style={{ background: theme.bg, fontFamily: FONT, color: theme.fg }}>
      <Sequence {...seq(T.intro)}><Intro {...props} /></Sequence>
      <Sequence {...seq(T.hook)}><Hook {...props} /></Sequence>
      {shots.map((s, i) => <Sequence key={i} {...seq(T.shot)}><ShotBeat shot={s} theme={theme} /></Sequence>)}
      <Sequence {...seq(T.cta)}><Cta {...props} /></Sequence>
    </AbsoluteFill>
  );
}
