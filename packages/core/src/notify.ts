// Notification delivery. Email via Resend, Slack via an incoming webhook the founder pastes.
// Push and WhatsApp are interfaces for later (WhatsApp is optional per the PRD).
export interface NotificationPrefs {
  email?: boolean;
  slack?: boolean;
  slack_webhook?: string;
  push?: boolean;
  whatsapp?: boolean;
}

export interface OutgoingNotification {
  to: { email: string; prefs: NotificationPrefs };
  title: string;
  body?: string;
  url?: string;
}

export interface Channel {
  id: 'email' | 'slack' | 'push' | 'whatsapp';
  enabled(prefs: NotificationPrefs): boolean;
  send(n: OutgoingNotification): Promise<void>;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const emailChannel: Channel = {
  id: 'email',
  enabled: (p) => p.email !== false,
  async send(n) {
    const key = process.env.RESEND_API_KEY;
    const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0d0d12">
      <p style="font-size:17px;font-weight:600;margin:0 0 8px">${escape(n.title)}</p>
      ${n.body ? `<p style="margin:0 0 16px;color:#55555f">${escape(n.body)}</p>` : ''}
      ${n.url ? `<p><a href="${escape(n.url)}" style="background:#5b3df5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Open ShipItLoud</a></p>` : ''}
      <p style="margin-top:24px;font-size:12px;color:#85858f">You get this because notifications are on for your workspace. Change it in Settings.</p>
    </div>`;
    if (!key) {
      console.log(`[email:dev] to=${n.to.email} :: ${n.title}${n.url ? ` -> ${n.url}` : ''}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'ShipItLoud <onboarding@resend.dev>', to: n.to.email, subject: n.title, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  },
};

export const slackChannel: Channel = {
  id: 'slack',
  enabled: (p) => !!p.slack && !!p.slack_webhook,
  async send(n) {
    const res = await fetch(n.to.prefs.slack_webhook!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `*${n.title}*${n.body ? `\n${n.body}` : ''}${n.url ? `\n<${n.url}|Open ShipItLoud>` : ''}` }),
    });
    if (!res.ok) throw new Error(`Slack ${res.status}`);
  },
};

export const channels: Channel[] = [emailChannel, slackChannel];

/** Sends on every enabled channel; returns the ones that succeeded. One failing channel never blocks the others. */
export async function deliver(n: OutgoingNotification, list: Channel[] = channels): Promise<string[]> {
  const sent: string[] = [];
  for (const c of list) {
    if (!c.enabled(n.to.prefs)) continue;
    try {
      await c.send(n);
      sent.push(c.id);
    } catch (err) {
      console.error(`[notify] ${c.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
