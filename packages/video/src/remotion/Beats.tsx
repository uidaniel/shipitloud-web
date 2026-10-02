import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { beatFrames, type Beat, type BeatsProps, type Media, type VideoTheme } from '../types';
import { Brand, Words, useFonts } from './Demo';

// Faceless short-form video built from "beats": hook, captions over footage, X-vs-Y splits, lists, end card.
// One composition covers every short-video format in the library (POV, expectation vs reality, and so on).

const FADE = 8;

function useFade(length: number) {
  const f = useCurrentFrame();
  return interpolate(f, [0, FADE, length - FADE, length], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

/** Animated brand background: two soft blobs of the accent colour drifting. Our own, so no licence needed. */
function BrandBackdrop({ theme }: { theme: VideoTheme }) {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const a = Math.sin(f / 70), c = Math.cos(f / 90);
  // Radial gradients, not CSS blur: blur on large shapes makes every frame slow to render.
  const blob = (x: number, y: number, r: number, o: number) => (
    <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, background: `radial-gradient(circle, ${theme.accent} 0%, transparent 68%)`, opacity: o }} />
  );
  return (
    <AbsoluteFill style={{ background: theme.bg, overflow: 'hidden' }}>
      {blob(width * (0.2 + 0.06 * a), height * (0.18 + 0.04 * c), width * 0.42, 0.22)}
      {blob(width * (0.85 - 0.05 * c), height * (0.82 + 0.05 * a), width * 0.5, 0.16)}
    </AbsoluteFill>
  );
}

function MediaLayer({ media, theme }: { media: Media; theme: VideoTheme }) {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const zoom = interpolate(f, [0, 180], [1.04, 1.12]);
  if (media.kind === 'video') {
    return (
      <AbsoluteFill>
        <OffthreadVideo src={media.src} muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${theme.bg}e6 0%, ${theme.bg}66 40%, ${theme.bg}cc 100%)` }} />
      </AbsoluteFill>
    );
  }
  if (media.kind === 'image') {
    return (
      <AbsoluteFill>
        <Img src={media.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${theme.bg}e6 0%, ${theme.bg}55 45%, ${theme.bg}cc 100%)` }} />
      </AbsoluteFill>
    );
  }
  // A founder screenshot: shown whole in a phone-shaped frame, lower half of the screen.
  const w = width * 0.62;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: width * 0.12 }}>
      <div style={{ width: w, height: w * 1.55, borderRadius: w * 0.09, overflow: 'hidden', border: `${w * 0.025}px solid #15151b`, boxShadow: '0 40px 90px rgba(0,0,0,.5)', transform: `scale(${interpolate(f, [0, 20], [0.94, 1], { extrapolateRight: 'clamp' })})`, background: '#fff' }}>
        <Img src={media.src} style={{ width: '100%', display: 'block', transform: `translateY(${interpolate(f, [20, 160], [0, -18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%)` }} />
      </div>
    </AbsoluteFill>
  );
}

function BeatView({ beat, props, length }: { beat: Beat; props: BeatsProps; length: number }) {
  const f = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const o = useFade(length);
  const m = Math.min(width, height);
  const pad = Math.round(width * 0.08);
  const { theme } = props;
  const media = 'media' in beat ? beat.media : null;
  const top = !!media && media.kind === 'shot';

  if (beat.layout === 'end') {
    const pill = spring({ frame: f - 14, fps, config: { damping: 200 } });
    return (
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: m * 0.05, padding: pad, opacity: o }}>
        <Brand name={props.name} logo={props.logo} theme={theme} size={Math.round(m * 0.05)} />
        <Words text={beat.text} size={Math.round(m * 0.085)} color={theme.fg} align="center" delay={4} />
        {props.host && <div style={{ opacity: pill, transform: `translateY(${(1 - pill) * 20}px)`, background: theme.accent, color: theme.onAccent, fontWeight: 600, fontSize: Math.round(m * 0.042), padding: `${m * 0.02}px ${m * 0.05}px`, borderRadius: 999 }}>{props.host}</div>}
      </AbsoluteFill>
    );
  }
  if (beat.layout === 'split') {
    const half = (side: { label: string; text: string }, accent: boolean, delay: number) => {
      const s = spring({ frame: f - delay, fps, config: { damping: 200 } });
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: m * 0.025, padding: pad, opacity: s, transform: `translateY(${(1 - s) * 40}px)`, background: accent ? `${theme.accent}22` : 'transparent', borderTop: accent ? `2px solid ${theme.accent}55` : undefined }}>
          <div style={{ fontSize: m * 0.04, fontWeight: 600, color: accent ? theme.accent : theme.muted, letterSpacing: '-0.01em' }}>{side.label}</div>
          <div style={{ fontSize: m * 0.068, fontWeight: 700, color: theme.fg, lineHeight: 1.1, letterSpacing: '-0.03em' }}>{side.text}</div>
        </div>
      );
    };
    return (
      <AbsoluteFill style={{ opacity: o, flexDirection: 'column' }}>
        {beat.text && <div style={{ padding: `${pad}px ${pad}px 0` }}><Words text={beat.text} size={Math.round(m * 0.06)} color={theme.fg} /></div>}
        {half(beat.left, false, 6)}
        {half(beat.right, true, 22)}
      </AbsoluteFill>
    );
  }
  if (beat.layout === 'list') {
    return (
      <AbsoluteFill style={{ opacity: o, padding: pad, justifyContent: 'center', gap: m * 0.05 }}>
        <Words text={beat.text} size={Math.round(m * 0.075)} color={theme.fg} />
        <div style={{ display: 'grid', gap: m * 0.035 }}>
          {beat.items.map((it, i) => {
            const s = spring({ frame: f - 14 - i * Math.max(10, (length - 30) / Math.max(1, beat.items.length)), fps, config: { damping: 200 } });
            return (
              <div key={i} style={{ display: 'flex', gap: m * 0.03, alignItems: 'baseline', opacity: s, transform: `translateX(${(1 - s) * 30}px)` }}>
                <span style={{ fontSize: m * 0.05, fontWeight: 700, color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: m * 0.056, fontWeight: 600, color: theme.fg, lineHeight: 1.2 }}>{it}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  // title / caption
  const big = beat.layout === 'title';
  return (
    <AbsoluteFill style={{ opacity: o }}>
      {media && <MediaLayer media={media} theme={theme} />}
      <AbsoluteFill style={{ padding: pad, paddingTop: top ? pad * 1.6 : pad, justifyContent: top ? 'flex-start' : 'center' }}>
        <Words text={beat.text} size={Math.round(m * (big ? 0.1 : 0.075))} color={theme.fg} align={big && !top ? 'left' : 'left'} />
        {beat.layout === 'caption' && beat.sub && (
          <div style={{ marginTop: m * 0.03, fontSize: m * 0.045, color: theme.muted, fontWeight: 500, lineHeight: 1.3, opacity: interpolate(f, [18, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{beat.sub}</div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function Beats(props: BeatsProps) {
  useFonts();
  let at = 0;
  return (
    <AbsoluteFill style={{ fontFamily: 'Geist, system-ui, sans-serif', color: props.theme.fg }}>
      <BrandBackdrop theme={props.theme} />
      {props.beats.map((b, i) => {
        const len = beatFrames(b);
        const from = at;
        at += len;
        return <Sequence key={i} from={from} durationInFrames={len}><BeatView beat={b} props={props} length={len} /></Sequence>;
      })}
    </AbsoluteFill>
  );
}
