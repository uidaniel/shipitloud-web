'use client';

import { useActionState, useState } from 'react';
import { Submit, kept, keptOn } from '@/components/app/ui';
import { createAdCampaign } from '../../actions';

const COUNTRIES = [['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['AU', 'Australia'], ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'], ['NL', 'Netherlands'], ['ES', 'Spain'], ['IT', 'Italy'], ['SE', 'Sweden'], ['NG', 'Nigeria']] as const;

export function CampaignForm({ ws, landing }: { ws: string; landing: string }) {
  const [state, action] = useActionState(createAdCampaign, {});
  const [daily, setDaily] = useState(String(kept(state, 'daily_cap', '10')));
  const d = Number(daily) || 0;
  return (
    <form action={action} className="pr-section">
      <input type="hidden" name="ws" value={ws} />
      <div className="pr-section-h"><h2>New campaign</h2><p>You set the limits. We write the ads, you approve them, and nothing spends before you press Launch.</p></div>
      <div className="pr-section-b" style={{ display: 'grid', gap: 16 }}>
        <div className="pr-grid-2">
          <fieldset className="pr-fieldset">
            <legend className="pr-label">Where</legend>
            <div className="pr-seg">
              <label><input type="radio" name="platform" value="meta" defaultChecked={keptOn(state, 'platform', true, 'meta')} /><span>Facebook and Instagram</span></label>
              <label><input type="radio" name="platform" value="google" defaultChecked={keptOn(state, 'platform', false, 'google')} /><span>Google search</span></label>
            </div>
          </fieldset>
          <fieldset className="pr-fieldset">
            <legend className="pr-label">Goal</legend>
            <div className="pr-seg">
              {[['signups', 'Signups'], ['traffic', 'Visits'], ['installs', 'App installs']].map(([v, l]) => (
                <label key={v}><input type="radio" name="goal" value={v} defaultChecked={keptOn(state, 'goal', v === 'signups', v)} /><span>{l}</span></label>
              ))}
            </div>
          </fieldset>
        </div>
        <div>
          <label className="pr-label" htmlFor="alu">Page the ads open</label>
          <input id="alu" name="landing_url" className="pr-input" defaultValue={kept(state, 'landing_url', landing)} placeholder="yourproduct.com" />
        </div>
        <fieldset className="pr-fieldset">
          <legend className="pr-label">Countries <span style={{ color: 'var(--faint)' }}>· only you can change these later</span></legend>
          <div className="pr-country">
            {COUNTRIES.map(([code, name]) => (
              <label key={code}><input type="checkbox" name="regions" value={code} defaultChecked={keptOn(state, 'regions', code === 'US' || code === 'GB', code)} /><span>{name}</span></label>
            ))}
          </div>
        </fieldset>
        <div className="pr-grid-2">
          <div>
            <label className="pr-label" htmlFor="adc">Daily cap (USD)</label>
            <div className="pr-prefix"><span>$</span><input id="adc" name="daily_cap" className="pr-input" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} /></div>
          </div>
          <div>
            <label className="pr-label" htmlFor="atc">Total cap (USD)</label>
            <div className="pr-prefix"><span>$</span><input id="atc" name="total_cap" className="pr-input" inputMode="decimal" defaultValue={kept(state, 'total_cap', '100')} /></div>
          </div>
        </div>
        <p className={`pr-mode-note ${d >= 10 ? 'auto' : ''}`}>
          {d >= 10
            ? <><b>Autopilot.</b> After a 7-day test we pause losing ads, move budget to winners and refresh tired ads, always inside your caps. Every change is logged with its reason.</>
            : <><b>Test mode.</b> Under $10 a day there isn’t enough data to tell good ads from luck, so we launch and report but don’t optimize or claim results.</>}
        </p>
      </div>
      <div className="pr-section-f">
        {state.error && <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>}
        <Submit pending="Writing your ads…">Write the ads</Submit>
      </div>
    </form>
  );
}
