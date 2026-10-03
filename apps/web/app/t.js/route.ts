// The tracking snippet founders add to their site:
//   <script src="https://<app>/t.js" data-key="<tracking key>" defer></script>
// It remembers where a visitor first came from (in their own browser, no cookies), counts page views, and counts
// signups when the site calls shipitloud('signup') or a form with data-shipitloud="signup" is submitted.
// In the founder's app, shipitloud('identify', userId) links events to their own (opaque) user id, so we can see
// who signed up but didn't activate; shipitloud('reset') on log out. It never reads form fields or emails.
const SNIPPET = `(function () {
  var s = document.currentScript; if (!s) return;
  var key = s.getAttribute('data-key'); if (!key) return;
  var api = new URL(s.src).origin + '/api/t';
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var q = new URLSearchParams(location.search);
  var touch = { source: q.get('utm_source'), medium: q.get('utm_medium'), campaign: q.get('utm_campaign'), ref: q.get('sil'), fbclid: q.get('fbclid'), at: Date.now() };
  if (!touch.source && document.referrer) { try { var h = new URL(document.referrer).hostname.replace(/^www\\./, ''); if (h && h !== location.hostname.replace(/^www\\./, '')) { touch.source = h; touch.medium = 'referral'; } } catch (e) {} }
  if (touch.fbclid && !touch.source) { touch.source = 'facebook'; touch.medium = 'paid'; }
  var first = null; try { first = JSON.parse(store.get('sil_first') || 'null'); } catch (e) {}
  if (!first && (touch.source || touch.ref || touch.fbclid)) { first = touch; store.set('sil_first', JSON.stringify(first)); }
  var t = first || touch;
  var vid = store.get('sil_vid'); if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('sil_vid', vid); }
  var quiet = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  function send(type, name) {
    if (quiet && type === 'pageview') return;
    var body = JSON.stringify({ key: key, type: type, name: name || null, visitor: vid, user: store.get('sil_uid'), consent: store.get('sil_consent'), fbc: t.fbclid ? 'fb.1.' + (t.at || Date.now()) + '.' + t.fbclid : null, path: location.pathname, referrer: document.referrer ? (function () { try { return new URL(document.referrer).hostname; } catch (e) { return null; } })() : null, source: t.source, medium: t.medium, campaign: t.campaign, ref: t.ref });
    if (navigator.sendBeacon && navigator.sendBeacon(api, new Blob([body], { type: 'text/plain' }))) return;
    try { fetch(api, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'content-type': 'text/plain' } }); } catch (e) {}
  }
  var queued = (window.shipitloud && window.shipitloud.q) || [];
  window.shipitloud = function (event, id) {
    if (event === 'identify') { if (id && String(id).indexOf('@') < 0) { store.set('sil_uid', String(id).slice(0, 120)); send('custom', 'identify'); } return; }
    if (event === 'reset') { try { localStorage.removeItem('sil_uid'); } catch (e) {} return; }
    if (event === 'signup') send('signup'); else if (event) send('custom', String(event).slice(0, 40));
  };
  for (var i = 0; i < queued.length; i++) window.shipitloud.apply(null, queued[i]);
  document.addEventListener('submit', function (e) { var f = e.target; if (f && f.getAttribute && f.getAttribute('data-shipitloud') === 'signup') send('signup'); }, true);
  send('pageview');
})();
`;

export function GET() {
  return new Response(SNIPPET, {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' },
  });
}
