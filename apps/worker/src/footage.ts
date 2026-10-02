// Footage for faceless videos, each clip with a licence on record (PRD section 22: "unlicensed footage is blocked").
// Sources: the founder's own screenshots, our animated brand motion, and Pexels stock video when a key is set.
import { check, db } from './db.ts';

export interface Clip { clipId: string; kind: 'video' | 'image' | 'shot'; src: string; licenceId: string }

const publicUrl = (path: string) => db.storage.from('assets').getPublicUrl(path).data.publicUrl;

async function licence(row: { workspace_id: string | null; source: string; clip_id: string; url?: string | null; licence_type: string; commercial_use: boolean; attribution?: string | null }) {
  const existing = await (row.workspace_id ? db.from('footage_licences').select('id').eq('workspace_id', row.workspace_id) : db.from('footage_licences').select('id').is('workspace_id', null))
    .eq('source', row.source).eq('clip_id', row.clip_id).maybeSingle();
  if (existing.data) return existing.data.id as string;
  return check(await db.from('footage_licences').insert(row).select('id').single(), 'licence')!.id as string;
}

/** The founder's product screenshots: uploads first, then the screens captured for the demo video. */
export async function founderShots(workspaceId: string, max = 4): Promise<Clip[]> {
  const out: Clip[] = [];
  for (const dir of ['shots', 'video']) {
    const { data } = await db.storage.from('assets').list(`${workspaceId}/${dir}`, { sortBy: { column: 'created_at', order: 'desc' } });
    // Prefer phone-shaped screens for vertical video.
    const files = (data ?? []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name)).sort((a, b) => Number(/-m\.|mobile/.test(b.name)) - Number(/-m\.|mobile/.test(a.name)));
    for (const f of files) {
      if (out.length >= max) break;
      const path = `${workspaceId}/${dir}/${f.name}`;
      const id = await licence({ workspace_id: workspaceId, source: 'founder', clip_id: path, url: publicUrl(path), licence_type: 'Your own product screenshots', commercial_use: true });
      out.push({ clipId: path, kind: 'shot', src: publicUrl(path), licenceId: id });
    }
  }
  return out;
}

export async function brandMotion(): Promise<Clip> {
  const { data } = await db.from('footage_licences').select('id').is('workspace_id', null).eq('source', 'brand').eq('clip_id', 'brand-backdrop').single();
  return { clipId: 'brand-backdrop', kind: 'image', src: '', licenceId: data!.id };
}

export const stockEnabled = () => !!process.env.PEXELS_API_KEY;

/** One vertical stock clip for a search, under the Pexels License (free for commercial use). Null without a key. */
export async function stockVideo(query: string): Promise<Clip | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=5`, { headers: { Authorization: key }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    type V = { id: number; url: string; user: { name: string }; video_files: { link: string; width: number; height: number; file_type: string }[] };
    const { videos } = (await res.json()) as { videos: V[] };
    for (const v of videos ?? []) {
      const file = v.video_files.filter((f) => f.file_type === 'video/mp4' && f.height >= f.width && f.height >= 1280).sort((a, b) => a.height - b.height)[0];
      if (!file) continue;
      const clipId = `pexels:${v.id}`;
      const id = await licence({ workspace_id: null, source: 'pexels', clip_id: clipId, url: v.url, licence_type: 'Pexels License', commercial_use: true, attribution: `Video by ${v.user.name} on Pexels` });
      return { clipId, kind: 'video', src: file.link, licenceId: id };
    }
  } catch { /* fall back to brand motion */ }
  return null;
}

/** Every clip must have a commercial licence that hasn't expired. Returns what's missing, if anything. */
export async function licenceProblems(clipIds: string[], licenceIds: string[]): Promise<string[]> {
  if (!clipIds.length) return [];
  const { data } = licenceIds.length ? await db.from('footage_licences').select('id, clip_id, commercial_use, expires_at').in('id', licenceIds) : { data: [] };
  const ok = new Set((data ?? []).filter((l) => l.commercial_use && (!l.expires_at || Date.parse(l.expires_at) > Date.now())).map((l) => l.clip_id));
  return clipIds.filter((c) => !ok.has(c)).map((c) => `No commercial licence on record for ${c}`);
}
