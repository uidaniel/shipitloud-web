// Every platform sits behind this interface, with a fallback so features work before
// API approvals land (PRD build rules): no API or no connection => "copy and post".
export interface ProviderResult {
  externalId?: string;
  url?: string;
  /** Present when the founder must finish the action by hand. */
  copyAndPost?: { text: string; openUrl: string };
}

export interface ProviderContext {
  /** Decrypted OAuth token, when the workspace has connected this platform. */
  token?: string;
  simulate: boolean;
}

export interface Provider {
  id: string;
  /** True when this provider can act automatically (API approved + implemented). */
  automatic: boolean;
  /** Publishes inside ShipItLoud (e.g. the hosted blog): no token needed, and test mode doesn't apply. */
  internal?: boolean;
  execute(payload: Record<string, unknown>, ctx: ProviderContext): Promise<ProviderResult>;
}

const text = (p: Record<string, unknown>) => String(p.text ?? p.body ?? '');
const enc = encodeURIComponent;

// Where to send the founder when posting by hand.
const composeUrl: Record<string, (p: Record<string, unknown>) => string> = {
  x: (p) => `https://x.com/intent/post?text=${enc(text(p))}`,
  linkedin: () => 'https://www.linkedin.com/feed/?shareActive=true',
  reddit: (p) => (typeof p.thread_url === 'string' ? p.thread_url : 'https://www.reddit.com/submit'),
  hn: (p) => (typeof p.thread_url === 'string' ? p.thread_url : 'https://news.ycombinator.com/submit'),
  bluesky: (p) => (typeof p.thread_url === 'string' ? p.thread_url : `https://bsky.app/intent/compose?text=${enc(text(p))}`),
  github: (p) => (typeof p.thread_url === 'string' ? p.thread_url : 'https://github.com'),
  rss: (p) => (typeof p.thread_url === 'string' ? p.thread_url : 'about:blank'),
  instagram: () => 'https://www.instagram.com/',
  tiktok: () => 'https://www.tiktok.com/upload',
  whatsapp: (p) => `https://wa.me/?text=${enc(text(p))}`,
  producthunt: () => 'https://www.producthunt.com/posts/new',
  indiehackers: (p) => (typeof p.thread_url === 'string' ? p.thread_url : 'https://www.indiehackers.com/new-post'),
};

export function copyAndPost(id: string): Provider {
  return {
    id,
    automatic: false,
    async execute(payload) {
      return { copyAndPost: { text: text(payload), openUrl: (composeUrl[id] ?? (() => 'about:blank'))(payload) } };
    },
  };
}

const registry = new Map<string, Provider>();
for (const id of Object.keys(composeUrl)) registry.set(id, copyAndPost(id));

export function registerProvider(p: Provider) {
  registry.set(p.id, p);
}

export function getProvider(id: string): Provider {
  return registry.get(id) ?? copyAndPost(id);
}
