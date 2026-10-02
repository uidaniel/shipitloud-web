/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Designer-made poster layouts (PRD section 7). The AI never draws: it picks a template and fills
// text slots within their character limits. Logo, colors and type are inserted exactly.
// Satori subset: flexbox only, inline styles, no CSS grid.
import type { ReactElement } from 'react';
import type { Theme } from './color.ts';

export type FormatId = 'portrait' | 'square' | 'landscape' | 'story';
export const FORMATS: Record<FormatId, { w: number; h: number; label: string }> = {
  portrait: { w: 1080, h: 1350, label: 'Instagram / LinkedIn 4:5' },
  square: { w: 1080, h: 1080, label: 'Square 1:1' },
  landscape: { w: 1200, h: 675, label: 'X / LinkedIn 16:9' },
  story: { w: 1080, h: 1920, label: 'Story / Reel 9:16' },
};

export interface Slot { label: string; max: number; required?: boolean }
export interface RenderProps {
  slots: Record<string, string>;
  theme: Theme;
  brand: { name: string; url?: string | null; logo?: string | null };
  w: number;
  h: number;
}
export interface Template {
  id: string;
  name: string;
  use: string;
  slots: Record<string, Slot>;
  render: (p: RenderProps) => ReactElement;
}

const s = (p: RenderProps, k: string) => (p.slots[k] ?? '').trim();
/** Type scale relative to the canvas so every format keeps the same proportions. */
const u = (p: RenderProps) => Math.min(p.w, p.h) / 1080;
const host = (url?: string | null) => (url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '');

function Frame({ p, children, bg }: { p: RenderProps; children: ReactElement | ReactElement[]; bg?: string }) {
  const k = u(p);
  return (
    <div style={{ width: p.w, height: p.h, display: 'flex', flexDirection: 'column', background: bg ?? p.theme.bg, color: p.theme.fg, fontFamily: 'Geist', padding: 84 * k, position: 'relative' }}>
      {children}
    </div>
  );
}

function Brand({ p, align = 'row' }: { p: RenderProps; align?: 'row' | 'end' }) {
  const k = u(p);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 * k, justifyContent: align === 'end' ? 'flex-end' : 'flex-start' }}>
      {p.brand.logo ? <img src={p.brand.logo} width={64 * k} height={64 * k} style={{ borderRadius: 14 * k, objectFit: 'contain' }} /> : null}
      <span style={{ fontSize: 34 * k, fontWeight: 600, letterSpacing: -0.6 * k }}>{p.brand.name}</span>
    </div>
  );
}

function Foot({ p, left, right }: { p: RenderProps; left?: string; right?: string }) {
  const k = u(p);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28 * k, color: p.theme.muted, marginTop: 'auto' }}>
      <span>{left ?? host(p.brand.url)}</span>
      <span>{right ?? ''}</span>
    </div>
  );
}

/** Headline with an accent bar behind the key words (ink on accent, never white on lime). */
function Highlight({ p, text, mark, size }: { p: RenderProps; text: string; mark: string; size: number }) {
  const k = u(p);
  const i = mark ? text.toLowerCase().indexOf(mark.toLowerCase()) : -1;
  // Word-level pieces so lines wrap between words (no stray leading spaces); the marked phrase stays one piece.
  // Every word is its own piece so lines wrap cleanly. Highlighted words get a bar that bridges the gap to the
  // next highlighted word, and punctuation right after the phrase stays attached to it (never starts a line).
  const pieces: { t: string; on: boolean; tail?: string }[] = [];
  const words = (str: string, on: boolean) => str.split(/\s+/).filter(Boolean).forEach((w) => pieces.push({ t: w, on }));
  if (i < 0) words(text, false);
  else {
    words(text.slice(0, i), false);
    words(text.slice(i, i + mark.length), true);
    let rest = text.slice(i + mark.length);
    const punct = rest.match(/^[,.;:!?)]+/)?.[0];
    if (punct && pieces.length) { pieces[pieces.length - 1]!.tail = punct; rest = rest.slice(punct.length); }
    words(rest, false);
  }
  const gap = size * 0.2 * k;
  const pad = 10 * k;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: size * k, fontWeight: 700, lineHeight: 1.04, letterSpacing: -size * 0.045 * k, columnGap: gap }}>
      {pieces.map((x, j) => {
        if (!x.on) return <span key={j}>{x.t}</span>;
        const nextOn = pieces[j + 1]?.on;
        const prevOn = pieces[j - 1]?.on;
        return (
          <span key={j} style={{ display: 'flex' }}>
            <span style={{
              background: p.theme.accent, color: p.theme.onAccent,
              paddingLeft: prevOn ? gap / 2 : pad, paddingRight: nextOn ? gap / 2 : pad,
              marginLeft: prevOn ? -gap / 2 : -pad / 2, marginRight: nextOn ? -gap / 2 - 1 : -pad / 2,
              borderRadius: `${prevOn ? 0 : 6 * k}px ${nextOn ? 0 : 6 * k}px ${nextOn ? 0 : 6 * k}px ${prevOn ? 0 : 6 * k}px`,
            }}>{x.t}</span>
            {x.tail ? <span style={{ marginLeft: pad / 2 }}>{x.tail}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

export const TEMPLATES: Template[] = [
  {
    id: 'announce',
    name: 'Launch announcement',
    use: 'Launch day: the product is live.',
    slots: { kicker: { label: 'Small line above', max: 28 }, headline: { label: 'Headline', max: 48, required: true }, highlight: { label: 'Words to highlight (must appear in headline)', max: 20 }, sub: { label: 'One supporting line', max: 90 } },
    render: (p) => {
      const k = u(p);
      return (
        <Frame p={p}>
          <Brand p={p} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 * k, marginTop: 'auto', marginBottom: 'auto' }}>
            {s(p, 'kicker') ? <span style={{ fontSize: 32 * k, color: p.theme.accent, fontWeight: 600 }}>{s(p, 'kicker')}</span> : null}
            <Highlight p={p} text={s(p, 'headline')} mark={s(p, 'highlight')} size={p.h > p.w * 1.4 ? 120 : 104} />
            {s(p, 'sub') ? <span style={{ fontSize: 38 * k, color: p.theme.muted, lineHeight: 1.35, maxWidth: 900 * k }}>{s(p, 'sub')}</span> : null}
          </div>
          <Foot p={p} right="Live now" />
        </Frame>
      );
    },
  },
  {
    id: 'feature',
    name: 'Feature drop',
    use: 'Show one feature and the problem it removes.',
    slots: { label: { label: 'Feature name', max: 30, required: true }, headline: { label: 'What it does for the user', max: 60, required: true }, points: { label: 'Up to 3 short benefits, one per line', max: 120 } },
    render: (p) => {
      const k = u(p);
      const pts = s(p, 'points').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3);
      return (
        <Frame p={p}>
          <Brand p={p} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 30 * k, marginTop: 'auto' }}>
            <div style={{ display: 'flex' }}><span style={{ fontSize: 28 * k, fontWeight: 600, color: p.theme.onAccent, background: p.theme.accent, padding: `${8 * k}px ${18 * k}px`, borderRadius: 999 }}>New · {s(p, 'label')}</span></div>
            <span style={{ fontSize: 92 * k, fontWeight: 700, lineHeight: 1.03, letterSpacing: -4 * k }}>{s(p, 'headline')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 * k, marginTop: 10 * k }}>
              {pts.map((t) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 18 * k, fontSize: 34 * k, color: p.theme.muted }}>
                  <div style={{ width: 14 * k, height: 14 * k, borderRadius: 99, background: p.theme.accent, display: 'flex' }} />{t}
                </div>
              ))}
            </div>
          </div>
          <Foot p={p} />
        </Frame>
      );
    },
  },
  {
    id: 'countdown',
    name: 'Countdown',
    use: 'Days before launch.',
    slots: { number: { label: 'Number of days (digits)', max: 3, required: true }, unit: { label: 'Word after the number', max: 14, required: true }, line: { label: 'What happens then', max: 60, required: true } },
    render: (p) => {
      const k = u(p);
      return (
        <Frame p={p}>
          <Brand p={p} />
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' }}>
            <span style={{ fontSize: 420 * k, fontWeight: 700, lineHeight: 0.9, letterSpacing: -24 * k, color: p.theme.accent }}>{s(p, 'number')}</span>
            <span style={{ fontSize: 72 * k, fontWeight: 600, letterSpacing: -2.5 * k, marginTop: 10 * k }}>{s(p, 'unit')}</span>
            <span style={{ fontSize: 40 * k, color: p.theme.muted, marginTop: 26 * k, lineHeight: 1.3, maxWidth: 860 * k }}>{s(p, 'line')}</span>
          </div>
          <Foot p={p} right="Join the waitlist" />
        </Frame>
      );
    },
  },
  {
    id: 'stat',
    name: 'Big number',
    use: 'A real milestone or fact. Never invented.',
    slots: { number: { label: 'The number (real only)', max: 10, required: true }, label: { label: 'What it counts', max: 50, required: true }, note: { label: 'Context line', max: 80 } },
    render: (p) => {
      const k = u(p);
      return (
        <Frame p={p}>
          <Brand p={p} />
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 18 * k }}>
            <span style={{ fontSize: 300 * k, fontWeight: 700, letterSpacing: -16 * k, lineHeight: 0.92 }}>{s(p, 'number')}</span>
            <div style={{ display: 'flex', height: 10 * k, width: 160 * k, background: p.theme.accent, borderRadius: 4 * k }} />
            <span style={{ fontSize: 60 * k, fontWeight: 600, letterSpacing: -2 * k, lineHeight: 1.1 }}>{s(p, 'label')}</span>
            {s(p, 'note') ? <span style={{ fontSize: 34 * k, color: p.theme.muted }}>{s(p, 'note')}</span> : null}
          </div>
          <Foot p={p} />
        </Frame>
      );
    },
  },
  {
    id: 'problem',
    name: 'Before / after',
    use: 'The pain, then the fix.',
    slots: { before: { label: 'The pain, in the customer’s words', max: 70, required: true }, after: { label: 'Life with the product', max: 70, required: true } },
    render: (p) => {
      const k = u(p);
      const half = (label: string, text: string, on: boolean) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 * k, flex: 1, padding: 56 * k, borderRadius: 28 * k, background: on ? p.theme.accent : 'rgba(255,255,255,0.06)', color: on ? p.theme.onAccent : p.theme.fg }}>
          <span style={{ fontSize: 28 * k, fontWeight: 600, opacity: 0.75 }}>{label}</span>
          <span style={{ fontSize: 58 * k, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 * k, textDecoration: on ? 'none' : 'line-through', textDecorationColor: p.theme.muted }}>{text}</span>
        </div>
      );
      return (
        <Frame p={p}>
          <Brand p={p} />
          <div style={{ display: 'flex', flexDirection: p.w > p.h ? 'row' : 'column', gap: 24 * k, marginTop: 56 * k, flex: 1 }}>
            {half('Before', s(p, 'before'), false)}
            {half(`With ${p.brand.name}`, s(p, 'after'), true)}
          </div>
          <div style={{ display: 'flex', marginTop: 36 * k }}><Foot p={p} /></div>
        </Frame>
      );
    },
  },
  {
    id: 'steps',
    name: 'How it works',
    use: 'Three steps from problem to done.',
    slots: { title: { label: 'Title', max: 36, required: true }, step1: { label: 'Step 1', max: 40, required: true }, step2: { label: 'Step 2', max: 40, required: true }, step3: { label: 'Step 3', max: 40, required: true } },
    render: (p) => {
      const k = u(p);
      return (
        <Frame p={p}>
          <Brand p={p} />
          <span style={{ fontSize: 84 * k, fontWeight: 700, letterSpacing: -3.5 * k, lineHeight: 1.04, marginTop: 70 * k }}>{s(p, 'title')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
            {(['step1', 'step2', 'step3'] as const).map((key, i) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 30 * k, padding: `${30 * k}px 0`, borderTop: `${2 * k}px solid rgba(255,255,255,0.12)` }}>
                <span style={{ width: 64 * k, height: 64 * k, borderRadius: 99, background: i === 2 ? p.theme.accent : 'rgba(255,255,255,0.08)', color: i === 2 ? p.theme.onAccent : p.theme.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 * k, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontSize: 44 * k, fontWeight: 600, letterSpacing: -1 * k }}>{s(p, key)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', marginTop: 30 * k }}><Foot p={p} /></div>
        </Frame>
      );
    },
  },
  {
    id: 'quote',
    name: 'Founder note',
    use: 'Something the founder believes or learned. Their own words only, never a fake testimonial.',
    slots: { quote: { label: 'The line', max: 130, required: true }, by: { label: 'Who said it (the founder)', max: 40 } },
    render: (p) => {
      const k = u(p);
      return (
        <Frame p={p}>
          <span style={{ fontSize: 220 * k, fontWeight: 700, color: p.theme.accent, lineHeight: 0.8, height: 120 * k }}>“</span>
          <span style={{ fontSize: 70 * k, fontWeight: 600, lineHeight: 1.15, letterSpacing: -2.4 * k, marginTop: 30 * k }}>{s(p, 'quote')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 * k, marginTop: 'auto' }}>
            {s(p, 'by') ? <span style={{ fontSize: 32 * k, color: p.theme.muted }}>— {s(p, 'by')}</span> : null}
            <Brand p={p} />
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'cta',
    name: 'Join the waitlist',
    use: 'Push people to sign up.',
    slots: { headline: { label: 'Headline', max: 44, required: true }, highlight: { label: 'Words to highlight', max: 18 }, button: { label: 'Button text', max: 22, required: true } },
    render: (p) => {
      const k = u(p);
      return (
        <Frame p={p}>
          <Brand p={p} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 50 * k, marginTop: 'auto', marginBottom: 'auto' }}>
            <Highlight p={p} text={s(p, 'headline')} mark={s(p, 'highlight')} size={110} />
            <div style={{ display: 'flex' }}>
              <span style={{ fontSize: 40 * k, fontWeight: 600, padding: `${26 * k}px ${46 * k}px`, borderRadius: 999, background: p.theme.fg, color: p.theme.bg }}>{s(p, 'button')} →</span>
            </div>
          </div>
          <Foot p={p} />
        </Frame>
      );
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
