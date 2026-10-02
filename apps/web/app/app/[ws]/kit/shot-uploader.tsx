'use client';

import { useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/app/icons';
import { uploadShots } from '../../actions';

/** Picks screenshots, notes which are phone-shaped, uploads straight away. */
export function ShotUploader({ ws, room }: { ws: string; room: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  async function onPick(files: FileList | null) {
    setError('');
    const list = [...(files ?? [])].slice(0, room);
    if (!list.length) return;
    if (list.some((f) => f.size > 5_000_000)) { setError('Each screenshot must be under 5MB.'); return; }
    const form = new FormData();
    form.set('ws', ws);
    for (const f of list) {
      form.append('shots', f);
      try {
        const bmp = await createImageBitmap(f);
        if (bmp.height > bmp.width * 1.3) form.set(`shape:${f.name}`, 'tall');
        bmp.close();
      } catch {}
    }
    start(async () => {
      try { await uploadShots(form); } catch { setError('Upload failed. Try PNG or JPG under 5MB.'); }
      if (input.current) input.current.value = '';
    });
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => onPick(e.target.files)} />
      <button type="button" className="pr-btn" disabled={pending || room <= 0} onClick={() => input.current?.click()}>
        {pending ? <><span className="spin" /> Uploading…</> : <>{Icon.plus} Add screenshots</>}
      </button>
      {error && <span style={{ color: 'var(--err)', fontSize: 12 }}>{error}</span>}
    </div>
  );
}
