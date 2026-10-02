// "Open today" searches: Reddit, Indie Hackers and X, opened in the founder's own browser (PRD section 17).
export interface SmartLink { icon: 'reddit' | 'indiehackers' | 'x'; label: string; where: string; href: string }

const enc = encodeURIComponent;

export function smartLinks(cfg: { keywords: string[]; competitors: string[] }, subreddits: string[], plan: string): SmartLink[] {
  const phrases = [...cfg.keywords, ...cfg.competitors.map((c) => `alternative to ${c}`)].slice(0, 6);
  return [
    ...phrases.slice(0, 4).map((p) => ({ icon: 'reddit' as const, label: p, where: 'Reddit, this week', href: `https://www.reddit.com/search/?q=${enc(`"${p}"`)}&type=posts&sort=new&t=week` })),
    ...subreddits.slice(0, 3).map((s) => ({ icon: 'reddit' as const, label: `r/${s}`, where: 'Newest posts', href: `https://www.reddit.com/r/${enc(s)}/new/` })),
    ...phrases.slice(0, 2).map((p) => ({ icon: 'indiehackers' as const, label: p, where: 'Indie Hackers, last month', href: `https://www.google.com/search?q=${enc(`site:indiehackers.com "${p}"`)}&tbs=qdr:m` })),
    ...(plan !== 'scale' ? phrases.slice(0, 2).map((p) => ({ icon: 'x' as const, label: p, where: 'X, live', href: `https://x.com/search?q=${enc(`"${p}"`)}&f=live` })) : []),
  ];
}
