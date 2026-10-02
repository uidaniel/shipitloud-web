import { LogoIcon } from '@/components/logo';
import { PlatformIcon, type Platform } from './platform-icons';

// The approval inbox as a real-looking screenshot: MacBook Pro, macOS menu bar, Safari (light), app UI.
// Everything inside the screen is sized in --px (1/1280 of the screen width), so it scales like an image.

const rows = [
  { type: 'Reply', ch: 'hn', title: '“Ask HN: How did you get your first 100 users?”', where: 'Hacker News · 14 min ago', score: 94, wait: true },
  { type: 'Post', ch: 'x', title: 'Launch thread: “We built ShipItLoud in 14 days. Here’s the kit it made for itself.”', where: 'X · scheduled Tue 9:00', score: 91, wait: false },
  { type: 'Poster', ch: 'ig', title: 'Countdown: 3 days to launch', where: 'Instagram · 1080×1350', score: 88, wait: false },
  { type: 'Video', ch: 'tt', title: 'Demo cut, 30s, captions on', where: 'Reels · TikTok · X', score: 86, wait: true },
  { type: 'Email', ch: 'mail', title: 'Welcome + referral nudge', where: 'Waitlist · all contacts', score: 90, wait: false },
];

const channelIcon: Record<string, Platform> = { hn: 'hn', x: 'x', ig: 'instagram', tt: 'tiktok', mail: 'email' };

function Channel({ ch }: { ch: string }) {
  return <span className="ap-ch" aria-hidden="true"><PlatformIcon name={channelIcon[ch]!} size="100%" radius={0.24} /></span>;
}

const Ico = {
  sidebar: <svg viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4v12" stroke="currentColor" strokeWidth="1.3" /></svg>,
  back: <svg viewBox="0 0 20 20"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  fwd: <svg viewBox="0 0 20 20"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  lock: <svg viewBox="0 0 20 20"><rect x="5" y="9" width="10" height="7.5" rx="1.6" fill="currentColor" /><path d="M7 9V7a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>,
  reload: <svg viewBox="0 0 20 20"><path d="M15 10a5 5 0 1 1-1.6-3.7M15 4v3h-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  share: <svg viewBox="0 0 20 20"><path d="M10 2.5v10M6.5 6 10 2.5 13.5 6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 9H5.5v8h9V9H13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>,
  plus: <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  tabs: <svg viewBox="0 0 20 20"><rect x="3" y="5.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M6 3.5h8.5a2 2 0 0 1 2 2V14" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>,
  shield: <svg viewBox="0 0 20 20"><path d="M10 2.8 4.5 5v4.3c0 3.6 2.4 6.3 5.5 7.9 3.1-1.6 5.5-4.3 5.5-7.9V5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
  inbox: <svg viewBox="0 0 20 20"><path d="M3 11.5 5 4.5h10l2 7v4H3z M3 11.5h4l1 2h4l1-2h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
  plan: <svg viewBox="0 0 20 20"><rect x="3.5" y="4.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M3.5 8.5h13M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  ear: <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="10" cy="10" r="2.5" fill="currentColor" /></svg>,
  pen: <svg viewBox="0 0 20 20"><path d="m4 16 1-4 8-8 3 3-8 8z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
  chart: <svg viewBox="0 0 20 20"><path d="M4 16V9M8.5 16V5M13 16v-5M17 16V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  gear: <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  search: <svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="m13 13 3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  apple: <svg viewBox="0 0 20 20"><path fill="currentColor" d="M13.6 10.6c0-1.8 1.5-2.7 1.6-2.8-.9-1.3-2.2-1.4-2.7-1.5-1.1-.1-2.2.7-2.8.7s-1.5-.7-2.4-.6c-1.2 0-2.4.7-3 1.8-1.3 2.3-.3 5.6.9 7.4.6.9 1.3 1.9 2.3 1.8.9 0 1.3-.6 2.4-.6s1.4.6 2.4.6c1 0 1.6-.9 2.2-1.8.7-1 1-2 1-2.1 0 0-1.9-.7-1.9-2.9zM11.8 5.2c.5-.6.9-1.5.8-2.4-.8 0-1.7.5-2.2 1.2-.5.5-.9 1.4-.8 2.3.9.1 1.7-.4 2.2-1.1z" /></svg>,
};

export function MacInbox() {
  return (
    <div className="mac-stage">
      <div className="mac" role="img" aria-label="ShipItLoud's approval inbox open in Safari on a MacBook: drafts waiting for one-tap approval">
        <div className="mac-lid">
          <div className="mac-screen">
            <div className="mac-ui">
              <div className="mac-menubar">
                <span className="mb-apple">{Ico.apple}</span>
                <b>Safari</b>
                <span>File</span><span>Edit</span><span>View</span><span>History</span><span>Bookmarks</span><span>Window</span><span>Help</span>
                <span className="mb-right">
                  <span className="mb-batt"><i /></span>
                  <span>Fri 2 Oct</span>
                  <span>9:41 AM</span>
                </span>
              </div>

              <div className="sf-window">
                <div className="sf-toolbar">
                  <span className="sf-lights"><i /><i /><i /></span>
                  <span className="sf-btn">{Ico.sidebar}</span>
                  <span className="sf-btn sf-nav">{Ico.back}</span>
                  <span className="sf-btn sf-nav sf-dim">{Ico.fwd}</span>
                  <span className="sf-url">
                    <span className="sf-shield">{Ico.shield}</span>
                    <span className="sf-addr"><span className="sf-lock">{Ico.lock}</span>app.shipitloud.com</span>
                    <span className="sf-reload">{Ico.reload}</span>
                  </span>
                  <span className="sf-right">
                    <span className="sf-btn">{Ico.share}</span>
                    <span className="sf-btn">{Ico.plus}</span>
                    <span className="sf-btn">{Ico.tabs}</span>
                  </span>
                </div>
                <div className="sf-tabs">
                  <span className="sf-tab is-on"><LogoIcon size={14} /><span>Approval inbox · ShipItLoud</span></span>
                  <span className="sf-tab"><span className="sf-fav-hn">Y</span><span>Ask HN: How did you get your first 100 users?</span></span>
                  <span className="sf-tab"><span className="sf-fav-b">B</span><span>Balans · Invoice from WhatsApp</span></span>
                </div>

                <div className="ap">
                  <aside className="ap-side">
                    <div className="ap-ws"><span className="ap-ws-logo">B</span><span>Balans</span><span className="ap-chev">⌄</span></div>
                    <div className="ap-search">{Ico.search}<span>Search</span><kbd>⌘K</kbd></div>
                    <nav className="ap-nav">
                      <span className="is-on">{Ico.inbox}Inbox<em>5</em></span>
                      <span>{Ico.plan}Launch plan<em>Day 4</em></span>
                      <span>{Ico.ear}Listening<em>23</em></span>
                      <span>{Ico.pen}Content</span>
                      <span>{Ico.chart}Analytics</span>
                      <span>{Ico.gear}Settings</span>
                    </nav>
                    <div className="ap-trust">
                      <div><b>Trust mode</b><span>Routine posts auto-approve</span></div>
                      <span className="ap-toggle"><i /></span>
                    </div>
                  </aside>

                  <main className="ap-main">
                    <div className="ap-head">
                      <div>
                        <h4>Approval inbox</h4>
                        <p>5 drafts · 2 need you</p>
                      </div>
                      <div className="ap-actions">
                        <span className="ap-seg"><span className="is-on">All</span><span>Replies</span><span>Posts</span><span>Visuals</span></span>
                        <span className="ap-primary">Approve safe (3)</span>
                      </div>
                    </div>
                    <table className="ap-tbl">
                      <thead>
                        <tr><th>Draft</th><th>Type</th><th>Score</th><th>Status</th><th /></tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.title} className={r.wait ? 'is-wait' : 'is-auto'}>
                            <td className="ap-draft">
                              <Channel ch={r.ch} />
                              <span><b>{r.title}</b><small>{r.where}</small></span>
                            </td>
                            <td><span className="ap-type">{r.type}</span></td>
                            <td className="ap-score"><span className="ap-bar"><i style={{ width: `${r.score}%` }} /></span>{r.score}</td>
                            <td>
                              <span className="ap-st ap-wait">Needs you</span>
                              <span className="ap-st ap-ok">{r.wait ? 'Approved' : 'Auto-approved'}</span>
                            </td>
                            <td className="ap-act">
                              <span className="ap-btn ap-approve">Approve</span>
                              <span className="ap-btn ap-undo">Undo</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </main>
                </div>
              </div>
            </div>
          </div>
          <span className="mac-notch" aria-hidden="true"><i /></span>
        </div>
        <div className="mac-base" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
