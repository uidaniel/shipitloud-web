// "Open today" searches: Reddit, Indie Hackers and X, opened in the founder's own browser (PRD section 17).
// Searches must come back with something: no exact-phrase quotes (people rarely type a founder's exact phrase),
// shortest and broadest terms first, and time windows wide enough for niche topics.
export interface SmartLink { icon: 'reddit' | 'indiehackers' | 'x'; label: string; where: string; href: string }

const enc = encodeURIComponent;

/** The broadest useful form of a keyword: at most 3 words, without filler. */
export function broaden(p: string): string {
  const words = p.replace(/["“”]/g, '').split(/\s+/).filter((w) => w && !/^(the|a|an|for|to|of|in|on|app|apps|tool|tools|best)$/i.test(w));
  return (words.length ? words : p.split(/\s+/)).slice(0, 3).join(' ');
}

export function smartLinks(cfg: { keywords: string[]; competitors: string[] }, subreddits: string[], plan: string): SmartLink[] {
  const terms = [...new Set([...cfg.keywords].map(broaden).filter(Boolean))].sort((a, b) => a.split(' ').length - b.split(' ').length || a.length - b.length);
  const alts = cfg.competitors.slice(0, 2).map((c) => `${c} alternative`);
  const phrases = [...terms.slice(0, 4), ...alts].slice(0, 6);
  const short = terms[0] ?? phrases[0] ?? '';
  return [
    ...phrases.slice(0, 4).map((p) => ({ icon: 'reddit' as const, label: p, where: 'Reddit, newest', href: `https://www.reddit.com/search/?q=${enc(p)}&type=posts&sort=new&t=year` })),
    // Inside the communities where their users are: a short term, newest first, all time.
    ...subreddits.slice(0, 3).map((s) => ({ icon: 'reddit' as const, label: short ? `r/${s}: ${short}` : `r/${s}`, where: short ? 'Inside the community' : 'Newest posts', href: short ? `https://www.reddit.com/r/${enc(s)}/search/?q=${enc(short)}&restrict_sr=1&sort=new` : `https://www.reddit.com/r/${enc(s)}/new/` })),
    ...phrases.slice(0, 2).map((p) => ({ icon: 'indiehackers' as const, label: p, where: 'Indie Hackers, last year', href: `https://www.google.com/search?q=${enc(`site:indiehackers.com ${p}`)}&tbs=qdr:y` })),
    ...(plan !== 'scale' ? phrases.slice(0, 2).map((p) => ({ icon: 'x' as const, label: p, where: 'X, latest', href: `https://x.com/search?q=${enc(p)}&f=live` })) : []),
  ];
}
