// The growth analysis and channel plan views (PRD section 23), shared by the setup flow and the Growth plan page.
import { TYPE_LABEL, type ProductType } from '@shipitloud/engine';

export interface Analysis {
  id: string; status: string; error: string | null; product_type: ProductType | null; stage: string | null; pricing_model: string | null;
  summary: string | null; problem: string | null; ideal_customer: string | null; hangouts: string[]; positioning: string | null;
  page_fixes: { area: string; fix: string; why: string }[]; competitor_gaps: { competitor: string; how_they_market: string; gap: string }[];
  presence: { socials?: string[]; blog?: boolean; reviews?: string[]; appStore?: boolean; analytics?: boolean };
  growth_score: number | null; score_parts: { label: string; got: number; of: number; tip: string }[]; opportunities: { title: string; why: string }[];
  seconds: number | null; created_at: string;
  listing?: { store: 'apple' | 'google'; name: string; icon: string | null; screenshots: string[]; rating: number | null; ratings: number | null; category: string | null } | null;
  aso?: { title: string; subtitle: string; keywords: string; screenshots: { order: number; caption: string }[] } | null;
  review_themes?: { loves: string[]; complaints: string[] } | null;
}
export interface Channel { id: string; name: string; rank: number; role: 'lead' | 'support'; reason: string; enabled: boolean; connect: string | null }

const STAGE: Record<string, string> = { pre_launch: 'Pre-launch', just_launched: 'Just launched', growing: 'Growing' };
const AREA: Record<string, string> = { clarity: 'Clarity', cta: 'Call to action', trust: 'Trust' };
export const typeLabel = (t: string | null) => (t ? TYPE_LABEL[t as ProductType] ?? t : 'Unknown');
export const stageLabel = (s: string | null) => (s ? STAGE[s] ?? s : 'Unknown');

function Ring({ score }: { score: number }) {
  const r = 34; const c = 2 * Math.PI * r;
  const color = score >= 70 ? 'var(--ok)' : score >= 45 ? 'var(--warn)' : 'var(--err)';
  return (
    <svg viewBox="0 0 80 80" className="pr-ring" role="img" aria-label={`Growth score ${score} out of 100`}>
      <circle cx="40" cy="40" r={r} className="track" />
      <circle cx="40" cy="40" r={r} className="fill" style={{ stroke: color }} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 40 40)" />
      <text x="40" y="46" textAnchor="middle">{score}</text>
    </svg>
  );
}

export function AnalysisView({ a }: { a: Analysis }) {
  return (
    <div className="pr-growth">
      <section className="pr-growth-hero">
        <Ring score={a.growth_score ?? 0} />
        <div>
          <span className="k">Growth score</span>
          <p className="pos">{a.positioning}</p>
          <small>{typeLabel(a.product_type)} · {stageLabel(a.stage)}{a.pricing_model && a.pricing_model !== 'unknown' ? ` · ${a.pricing_model}` : ''}</small>
        </div>
      </section>

      <section>
        <h3>Your 3 biggest opportunities</h3>
        <ol className="pr-opps">{a.opportunities.map((o, i) => <li key={o.title}><span className="n">{i + 1}</span><div><b>{o.title}</b><p>{o.why}</p></div></li>)}</ol>
      </section>

      <div className="pr-grid-2" style={{ alignItems: 'start' }}>
        <section>
          <h3>Who signs up first</h3>
          <p className="pr-growth-p">{a.ideal_customer}</p>
          {a.hangouts.length > 0 && <div className="pr-tags">{a.hangouts.map((h) => <span key={h} className="pr-chip">{h}</span>)}</div>}
        </section>
        <section>
          <h3>Fix these on your page first</h3>
          <ul className="pr-fixes">{a.page_fixes.map((f) => <li key={f.area}><span className="pr-chip">{AREA[f.area] ?? f.area}</span><div><b>{f.fix}</b><small>{f.why}</small></div></li>)}</ul>
        </section>
      </div>

      {a.review_themes && (a.review_themes.loves.length > 0 || a.review_themes.complaints.length > 0) && (
        <div className="pr-grid-2" style={{ alignItems: 'start' }}>
          <section><h3>What users love <small className="pr-hint" style={{ fontWeight: 400 }}>· from your reviews</small></h3><ul className="pr-fixes">{a.review_themes.loves.map((x) => <li key={x}><span className="pr-chip pr-chip-ok">Love</span><div><b>{x}</b></div></li>)}</ul></section>
          <section><h3>What they complain about</h3><ul className="pr-fixes">{a.review_themes.complaints.map((x) => <li key={x}><span className="pr-chip pr-chip-warn">Fix</span><div><b>{x}</b></div></li>)}</ul></section>
        </div>
      )}

      {a.aso && (
        <section>
          <h3>App Store optimization</h3>
          <div className="pr-aso">
            <div className="pr-aso-row"><span>Title</span><b>{a.aso.title}</b><small>{a.aso.title.length}/30</small></div>
            <div className="pr-aso-row"><span>Subtitle</span><b>{a.aso.subtitle}</b><small>{a.aso.subtitle.length}/30</small></div>
            <div className="pr-aso-row"><span>Keywords</span><b style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{a.aso.keywords}</b><small>{a.aso.keywords.length}/100</small></div>
            {a.aso.screenshots.length > 0 && (
              <div className="pr-aso-shots">
                {[...a.aso.screenshots].sort((x, y) => x.order - y.order).map((sh, i) => (
                  <figure key={i}>{a.listing?.screenshots[sh.order - 1] ? <img src={a.listing.screenshots[sh.order - 1]} alt="" /> : <span className="sk" style={{ height: 196, display: 'block', borderRadius: 12 }} />}<figcaption>{i + 1}. {sh.caption}</figcaption></figure>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {a.competitor_gaps.length > 0 && (
        <section>
          <h3>Gaps your competitors leave <small className="pr-hint" style={{ fontWeight: 400 }}>· our read, not facts</small></h3>
          <div className="pr-gaps">{a.competitor_gaps.map((g) => <div key={g.competitor}><b>{g.competitor}</b>{g.how_they_market !== 'Not sure' && <small>{g.how_they_market}</small>}<p>{g.gap}</p></div>)}</div>
        </section>
      )}

      <details className="pr-more">
        <summary>How the score is worked out</summary>
        <ul className="pr-score-parts">{a.score_parts.map((p) => <li key={p.label}><span>{p.label}</span><span className="bar"><i style={{ width: `${(p.got / p.of) * 100}%` }} /></span><b>{p.got}/{p.of}</b>{p.got < p.of && <small>{p.tip}</small>}</li>)}</ul>
      </details>
    </div>
  );
}
