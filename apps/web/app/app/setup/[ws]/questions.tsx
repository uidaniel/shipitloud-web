'use client';

import { useRef, useState } from 'react';
import { Submit } from '@/components/app/ui';
import { supabaseBrowser } from '@/lib/supabase/client';
import { saveRecording, saveSetupAnswers, startRecordingUpload } from '../../actions';

type Q = { key: 'who' | 'does' | 'different'; label: string };
const QS: Q[] = [
  { key: 'who', label: 'Who is it for?' },
  { key: 'does', label: 'What’s the main thing it helps them do?' },
  { key: 'different', label: 'What makes it different from similar apps?' },
];

/** The 3 quick questions (tap an answer or write your own), an optional website and an optional screen recording. */
export function SetupQuestions({ ws, options, isApp, website, recording }: { ws: string; options: Record<Q['key'], string[]>; isApp: boolean; website: string | null; recording: { url: string; seconds: number } | null }) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  return (
    <form action={saveSetupAnswers} className="pr-qs">
      <input type="hidden" name="ws" value={ws} />
      {QS.map((q) => (
        <fieldset key={q.key} className="pr-q">
          <legend>{q.label}</legend>
          <div className="pr-seg">
            {(options[q.key] ?? []).map((o) => (
              <label key={o}><input type="radio" name={q.key} value={o} checked={picked[q.key] === o && !other[q.key]} onChange={() => { setPicked((p) => ({ ...p, [q.key]: o })); setOther((x) => ({ ...x, [q.key]: '' })); }} /><span>{o}</span></label>
            ))}
          </div>
          <input className="pr-input" name={`${q.key}_other`} placeholder="Or in your own words" maxLength={120} value={other[q.key] ?? ''} onChange={(e) => setOther((x) => ({ ...x, [q.key]: e.target.value }))} aria-label={`${q.label} (your own words)`} />
        </fieldset>
      ))}
      {isApp && (
        <div>
          <label className="pr-label" htmlFor="website">Your website (optional)</label>
          <input id="website" name="website" className="pr-input" defaultValue={website ?? ''} placeholder="yourapp.com" inputMode="url" />
          <p className="pr-hint">We’ll read it alongside your listing.</p>
        </div>
      )}
      <RecordingUpload ws={ws} recording={recording} />
      <div className="pr-onb-next"><Submit className="pr-btn pr-btn-primary pr-btn-lg" pending="Updating your analysis…">Continue</Submit></div>
    </form>
  );
}

function RecordingUpload({ ws, recording }: { ws: string; recording: { url: string; seconds: number } | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>(recording ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(recording ? `${Math.round(recording.seconds)} second recording` : null);

  async function upload(file: File) {
    setError(null);
    setState('busy');
    try {
      const seconds = await new Promise<number>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => { resolve(Number.isFinite(v.duration) ? v.duration : 0); URL.revokeObjectURL(v.src); };
        v.onerror = () => resolve(0);
        v.src = URL.createObjectURL(file);
      });
      const start = await startRecordingUpload(ws, file.type, file.size);
      if ('error' in start) throw new Error(start.error);
      const { error: up } = await supabaseBrowser().storage.from('assets').uploadToSignedUrl(start.path!, start.token!, file, { contentType: file.type });
      if (up) throw new Error('Upload failed. Check your connection and try again.');
      await saveRecording(ws, start.path!, seconds);
      setName(`${file.name} · ${Math.round(seconds)}s`);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setState('idle');
    }
  }

  return (
    <div className="pr-rec">
      <div>
        <b>A screen recording of your app (optional)</b>
        <small>30 to 60 seconds of the app in use. We pull key screens from it and use it in your demo video.</small>
      </div>
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      {state === 'busy' ? <span className="pr-chip"><span className="spin" /> Uploading…</span>
        : state === 'done' ? <span className="pr-chip pr-chip-ok">✓ {name}</span>
        : <button type="button" className="pr-btn pr-btn-sm" onClick={() => input.current?.click()}>Add a recording</button>}
      {error && <p className="pr-error" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{error}</p>}
    </div>
  );
}
