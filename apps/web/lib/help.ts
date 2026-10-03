// Help center articles (PRD section 25): short, direct, same voice as the product.
export interface Article { slug: string; title: string; summary: string; body: string[]; tags: string[] }

export const articles: Article[] = [
  {
    slug: 'setup', title: 'Your 10-minute setup', tags: ['start', 'analysis', 'plan', 'url'],
    summary: 'Paste your link, answer what we ask, and your growth plan and first posts are ready.',
    body: [
      'Paste your product’s link. We read your site (or your App Store or Google Play listing), work out what you sell and who it’s for, and score your growth potential.',
      'If your page says little, we ask 3 quick questions. Tap the closest answer or write your own.',
      'Next you see your growth plan: the channels that fit your kind of product, the 3 biggest opportunities, and fixes for your page.',
      'Connect only the accounts your plan uses. Anything not connected still works: we give you ready-to-post copy.',
      'Finally, approve your first wins: warm leads with drafted replies, your first week of posts and launch messages. Nothing goes out without your OK.',
      'Stopped halfway? Open ShipItLoud and pick up where you left off.',
    ],
  },
  {
    slug: 'channels', title: 'Connecting your channels', tags: ['connect', 'x', 'linkedin', 'reddit', 'instagram', 'tiktok', 'copy'],
    summary: 'What connects today, and how copy-and-post works for the rest.',
    body: [
      'Your growth plan only asks for the accounts it uses. Each one is optional.',
      'Until a platform approves direct posting, we prepare the post for you: copy it, open the platform in one tap, paste and post. Then tap “I posted it” so your results stay accurate.',
      'Reddit works through our Chrome extension: your browser does the reading, and you click post. See “The Reddit extension”.',
      'If a connection expires, we tell you and switch that channel to copy-and-post until you reconnect.',
    ],
  },
  {
    slug: 'trust-mode', title: 'Trust mode', tags: ['automation', 'approve', 'autopilot', 'manual'],
    summary: 'Let safe, high-scoring posts go out on their own. Replies to people always wait for you.',
    body: [
      'Manual (the default): you approve everything.',
      'Trust: scheduled posts, posters and emails that pass our checks go out on their own, with a short window to pull them back. Replies still need you.',
      'Full trust: also routine replies on low-risk sites like Hacker News and Bluesky. Ads and new campaigns always need you.',
      'If anything goes wrong (a removed post, a complaint), we drop back to Manual and tell you why.',
      'The kill switch in Settings stops every post, email and ad spend instantly.',
    ],
  },
  {
    slug: 'reddit-extension', title: 'The Reddit extension', tags: ['reddit', 'chrome', 'extension'],
    summary: 'Find Reddit posts worth replying to and draft replies right on Reddit.',
    body: [
      'Install the ShipItLoud extension in Chrome.',
      'In Settings → Chrome extension, create a connection and paste the code into the extension.',
      'Open Reddit. Posts worth a reply show up in the ShipItLoud panel with a drafted reply in your voice. You read, edit and post yourself.',
      'We never read Reddit from our servers, and nothing is posted without you clicking post.',
    ],
  },
  {
    slug: 'billing', title: 'Plans, trials and billing', tags: ['billing', 'trial', 'price', 'card', 'invoice', 'plan', 'pay'],
    summary: 'The 7-day Grow trial, what Free keeps, and managing your card.',
    body: [
      'Grow is free for 7 days. A card is needed to start, nothing is charged that day, and we remind you 2 days before the trial ends.',
      'Payments are handled by Dodo Payments, our merchant of record, so tax is included where it applies.',
      'Your card and invoices are under Billing → Card and invoices.',
      'If a payment fails we retry for 7 days and show a banner. After that your workspace moves to Free; nothing is deleted.',
      'The Free plan keeps your waitlist page, 5 posters a month and 3 warm leads a week, plus everything you made.',
      'Refer a founder from Billing: they get their first month of Grow free, and you get a month free after their first payment.',
    ],
  },
  {
    slug: 'cancel', title: 'Cancelling or pausing', tags: ['cancel', 'pause', 'refund', 'stop'],
    summary: 'One click, no calls. Pause for 1 or 2 months instead if you need a break.',
    body: [
      'Go to Billing → Cancel plan. Telling us why is optional.',
      'During a trial, cancelling ends it straight away and you’re never charged.',
      'On a paid plan, nothing more is charged and your plan runs until the month you paid for ends. Then you’re on Free with everything kept for 12 months. Changed your mind? Keep my plan, on the Billing page.',
      'Need a break instead? Pause for 1 or 2 months from Billing. Nothing is charged while paused, and it picks up again on the date.',
      'Refunds: see our Refund Policy.',
    ],
  },
  {
    slug: 'data', title: 'Exporting and deleting your data', tags: ['delete', 'export', 'privacy', 'gdpr', 'account'],
    summary: 'Download everything any time. Deleting has a 7-day grace period.',
    body: [
      'Settings → Your data → Download JSON gives you your whole workspace. Waitlist contacts download as CSV.',
      'To delete, type your workspace name in Settings → Your data. Connected accounts and keys are disconnected immediately. Everything else is deleted after 7 days, and you can undo until then.',
      'Your waitlist contacts can unsubscribe from any email, and you can delete any contact yourself.',
      'Backups are purged of deleted data within 30 days. Billing records are kept as the law requires.',
    ],
  },
];

export const findArticle = (slug: string) => articles.find((a) => a.slug === slug);

/** What’s new (also on /changelog). Newest first. */
export const changelog: { date: string; title: string; body: string }[] = [
  { date: '2026-10-03', title: 'Billing, trials and a new dashboard', body: 'Start Grow free for 7 days, pause or cancel in one click, refer a founder for a free month. Plus a simpler Home, a collapsible sidebar and colorful pages throughout.' },
  { date: '2026-10-02', title: 'App links', body: 'Paste an App Store or Google Play link: we read the listing and reviews, suggest App Store improvements, and turn a screen recording into your demo video.' },
  { date: '2026-10-01', title: '10-minute setup', body: 'Paste your link and get a growth score, a channel plan, first posts and warm leads, all approved from one screen.' },
  { date: '2026-09-29', title: 'Ads autopilot (Scale)', body: 'Daily and total caps, creatives you approve, and an autopilot that pauses losers and moves budget to winners.' },
];
