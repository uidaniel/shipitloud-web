'use client';

import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import Lenis from 'lenis';
import { Suspense, useEffect, useRef } from 'react';
import { JoinForm } from '@/components/join-form';
import { LogoIcon } from '@/components/logo';
import { site } from '@/lib/site';
import type { WaitlistStats } from '@/lib/waitlist';
import { SiteNav } from './site-nav';
import { AnalyticsSide } from './analytics-side';
import { Bars3D, SOURCES } from './bars-3d';
import { Globe } from './globe';
import { MacInbox } from './mac-inbox';
import { PlatformIcon } from './platform-icons';
import { motion } from './motion';
import { PricingSpace } from './pricing-space';
import { SpaceScene } from './space-scene';

gsap.registerPlugin(ScrollTrigger, useGSAP);

function Chars({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(' ').map((word, wi, words) => (
        <span className="word" aria-hidden="true" key={wi}>
          {[...word].map((c, ci) => <span className="ch" key={ci}>{c}</span>)}
          {wi < words.length - 1 && ' '}
        </span>
      ))}
    </span>
  );
}

const pipeline = [
  { title: 'Reads your product', note: 'Your site becomes a brand brain: customer, voice, competitors.', icon: 'eye' },
  { title: 'Writes your posts', note: 'Launch threads and replies, in your voice.', icon: 'pen' },
  { title: 'Makes your videos', note: 'Demo cuts and posters, captioned and sized.', icon: 'play' },
  { title: 'Finds your users', note: 'People already asking for what you built.', icon: 'target' },
] as const;

function PipeIcon({ name }: { name: (typeof pipeline)[number]['icon'] }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {name === 'eye' && <><path {...p} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle {...p} cx="12" cy="12" r="3" /></>}
      {name === 'pen' && <><path {...p} d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" /><path {...p} d="M13.5 7l3.5 3.5" /></>}
      {name === 'play' && <><rect {...p} x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.2v5.6l4.6-2.8z" fill="currentColor" /></>}
      {name === 'target' && <><circle {...p} cx="12" cy="12" r="8.5" /><circle {...p} cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /></>}
    </svg>
  );
}



export function LaunchPage({ stats }: { stats: WaitlistStats }) {
  const root = useRef<HTMLDivElement>(null);
  const goal = site.goals.signups;
  const pct = Math.min(1, stats.total / goal);

  // Smooth scroll; its velocity drives the starfield streaks.
  useEffect(() => {
    // A fresh load always starts at the top.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.09, anchors: { offset: -72 } });
    lenis.on('scroll', (e: Lenis) => {
      motion.velocity = e.velocity;
      ScrollTrigger.update();
    });
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      motion.velocity = 0;
    };
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // ---- ignition: countdown, then the headline and the flame
        // Reveal first, so every from() below records "visible" as its end state.
        gsap.set('.prehide', { autoAlpha: 1 });
        const intro = gsap.timeline({ paused: true, defaults: { ease: 'power4.out' } });
        requestAnimationFrame(() => intro.play());
        intro
          .from('.sp-hero .ch', { yPercent: 115, autoAlpha: 0, duration: 0.9, stagger: 0.022 }, 0.1)
          .from('.hero-title .loud', { scaleX: 0, transformOrigin: '0% 50%', duration: 0.7, ease: 'power3.out' }, 0.3)
          .from('.hero-sub, .hero-form, .hero-meta', { y: 24, autoAlpha: 0, duration: 0.8, stagger: 0.08 }, 0.55)

        // ---- the hero drifts up and fades as you scroll away
        gsap.timeline({ scrollTrigger: { trigger: '.sp-hero', start: 'top top', end: 'bottom top', scrub: 0.6 } })
          .to('.hero-copy', { y: -80, autoAlpha: 0, ease: 'none' }, 0)

        // ---- the story: lines light up as you read
        const storyTl = gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: '.story-in', start: 'top 75%', once: true } });
        storyTl
          .from('.st-a', { y: 40, autoAlpha: 0, duration: 0.5 })
          .from('.st-b', { y: 40, autoAlpha: 0, duration: 0.5 }, '-=0.2')
          .from('.story-kicker', { y: 16, autoAlpha: 0, duration: 0.4 })
          .from('.pipe-step', { y: 30, autoAlpha: 0, stagger: 0.15, duration: 0.4 }, '<');
        gsap.utils.toArray<HTMLElement>('.pipe-step').forEach((step, i, all) => {
          storyTl
            .to('.pipe-line i', { scaleX: (i + 1) / all.length, duration: 0.35, ease: 'none' }, i === 0 ? '-=0.2' : '>')
            .to(step, { className: 'pipe-step is-on', duration: 0.01 }, '<0.2');
        });
        storyTl.from('.story-stamp', { y: 20, autoAlpha: 0, scale: 0.96, duration: 0.5 }, '-=0.1');

        // Desktop: tiles rise in. Phones: tiles stick and stack, each new one sliding over the last.
        mm.add('(min-width: 900px)', () => {
          gsap.utils.toArray<HTMLElement>('.bt').forEach((el) => {
            gsap.from(el, { y: 60, autoAlpha: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
          });
        });
        const stack = (selector: string) => {
          const cards = gsap.utils.toArray<HTMLElement>(selector);
          cards.forEach((el, i) => {
            const next = cards[i + 1];
            if (!next) return;
            // Dim only while the next card is actually sliding over this one.
            const stickTop = () => parseFloat(getComputedStyle(el).top) || 0;
            gsap.fromTo(el, { scale: 1, filter: 'brightness(1)' }, {
              scale: 0.94, filter: 'brightness(0.6)', ease: 'none',
              scrollTrigger: {
                trigger: next,
                start: () => `top ${stickTop() + el.offsetHeight}px`,
                end: () => `top ${stickTop() + 12}px`,
                scrub: 0.8,
                invalidateOnRefresh: true,
              },
            });
          });
        };
        mm.add('(max-width: 899px)', () => stack('.bt'));

        // ---- mission control: drafts arrive, then one gets approved
        gsap.fromTo('.mac', { rotateX: 28, scale: 0.86, y: 40 }, {
          rotateX: 0, scale: 1, y: 0, ease: 'none',
          scrollTrigger: { trigger: '.mac-stage', start: 'top 95%', end: 'top 30%', scrub: 0.6 },
        });
        gsap.timeline({ scrollTrigger: { trigger: '.mac-stage', start: 'top 45%' } })
          .from('.ap-tbl tbody tr', { y: 10, autoAlpha: 0, duration: 0.45, stagger: 0.1, ease: 'power2.out' })
          .call(() => root.current?.querySelector('.ap-tbl tbody tr')?.classList.add('is-approved'), [], '+=0.9');

        // ---- payload: kit assets drift in at different speeds
        gsap.utils.toArray<HTMLElement>('.asset-card').forEach((el, i) => {
          gsap.from(el, { y: 120 + i * 50, rotate: (i - 1) * 4, autoAlpha: 0, ease: 'power3.out', scrollTrigger: { trigger: '.kit-grid', start: 'top 85%', end: 'top 35%', scrub: 0.8 } });
        });

        // ---- telemetry: the orbit ring fills and the number counts up
        const ring = root.current!.querySelector<SVGCircleElement>('.orbit-fill');
        const num = root.current!.querySelector<HTMLElement>('[data-total]');
        const tel = gsap.timeline({ scrollTrigger: { trigger: '.orbit-box', start: 'top 75%' } });
        if (ring) {
          const c = 2 * Math.PI * Number(ring.getAttribute('r'));
          tel.fromTo(ring, { strokeDashoffset: c }, { strokeDashoffset: c * (1 - pct), duration: 1.6, ease: 'power3.inOut' }, 0);
          tel.fromTo('.orbit-ship', { rotate: 0 }, { rotate: 360 * pct, duration: 1.6, ease: 'power3.inOut' }, 0);
        }
        if (num) {
          const o = { v: 0 };
          tel.to(o, { v: stats.total, duration: 1.6, ease: 'power3.out', onUpdate: () => { num.textContent = Math.round(o.v).toLocaleString('en-US'); } }, 0);
        }

        // ---- pricing cards fan in
        mm.add('(min-width: 680px)', () => {
          gsap.from('[data-plan]', { y: 80, autoAlpha: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '.plans-grid', start: 'top 80%' } });
        });

        // ---- final: the planet rises into view
        gsap.from('.globe-wrap', { yPercent: 30, ease: 'none', scrollTrigger: { trigger: '.final-space', start: 'top bottom', end: 'bottom bottom', scrub: true } });

        // ---- generic reveals
        ScrollTrigger.batch('[data-reveal]', {
          start: 'top 85%',
          onEnter: (els) => gsap.from(els, { y: 40, autoAlpha: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out', overwrite: true }),
          once: true,
        });
      });

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('.prehide', { autoAlpha: 1 });
        const ring = root.current!.querySelector<SVGCircleElement>('.orbit-fill');
        if (ring) ring.style.strokeDashoffset = String(2 * Math.PI * Number(ring.getAttribute('r')) * (1 - pct));
      });

    },
    { scope: root },
  );

  return (
    <div ref={root} className="space">
      <div className="space-bg" aria-hidden="true" />
      <SpaceScene />

      <SiteNav />

      <main>
        <section id="join" className="sp-hero" aria-labelledby="hero-h">
          <div className="sp-wrap hero-grid">
            <div className="hero-copy">
              <p className="telemetry prehide">
                <span className="live-dot" />Early access opens soon
              </p>
              <h1 id="hero-h" className="hero-title prehide">
                <Chars text="You built it." className="line-1" />
                <span className="line-2">
                  <Chars text="Ship it" /> <span className="loud-wrap"><Chars text="loud." className="loud" /></span>
                </span>
              </h1>
              <p className="hero-sub prehide">Paste your product. Get a launch kit, a 30-day plan and your first users.</p>
              <div className="hero-form prehide">
                <Suspense>
                  <JoinForm onInk meta="Free waitlist page · No card · Early access first" />
                </Suspense>
              </div>
            </div>
          </div>
          <a href="#story" className="scroll-cue">
            <span>Scroll to launch</span>
            <i aria-hidden="true" />
          </a>
        </section>

        <section id="story" className="story" aria-label="Why ShipItLoud">
          <div className="story-photo" aria-hidden="true" />
          <div className="sp-wrap story-in">
            <h2 className="story-title">
              <span className="st-a">Building it was the hard part.</span>
              <span className="st-b">Getting users <span className="loud">shouldn&apos;t be.</span></span>
            </h2>
            <p className="story-kicker">Paste your link. ShipItLoud does the rest:</p>
            <ol className="pipe">
              <span className="pipe-line" aria-hidden="true"><i /></span>
              {pipeline.map((step) => (
                <li key={step.title} className="pipe-step">
                  <span className="pipe-ico"><PipeIcon name={step.icon} /></span>
                  <h3>{step.title}</h3>
                  <p>{step.note}</p>
                </li>
              ))}
            </ol>
            <p className="story-stamp"><span className="stamp-check" aria-hidden="true">✓</span>You approve. We do the marketing.</p>
          </div>
        </section>

        <section id="how" className="sec" aria-labelledby="how-h">
          <div className="sp-wrap">
            <h2 id="how-h" className="title" data-reveal>What it does for you</h2>
            <div className="bento">
              <article className="bt bt-launch">
                <h3>Paste your URL. Get the whole launch kit.</h3>
                <p>Waitlist page, demo video, posters, launch posts and a 30-day plan, in your brand.</p>
                <div className="bv-kit" aria-hidden="true">
                  <span className="bv-poster"><LogoIcon size={22} /><span>Don&apos;t launch in <b>silence.</b></span><small>shipitloud.com</small></span>
                  <span className="bv-video"><span className="bv-vtext">POV: the app is done.</span><i /><small>0:30</small></span>
                  <span className="bv-post"><span className="bv-post-who"><LogoIcon size={16} square={false} /><b>ShipItLoud</b></span><span className="bv-post-t">Launch day. We built ShipItLoud in 14 days, and it made its own launch kit.</span><span className="bv-post-m">X · thread 1/4</span></span>
                </div>
              </article>
              <article className="bt bt-grow">
                <h3>It finds people asking for what you built.</h3>
                <p>Then drafts a reply in your voice.</p>
                <div className="bv-reply" aria-hidden="true">
                  <p className="bv-q"><span className="bv-src"><PlatformIcon name="reddit" size={16} />r/SideProject · 14 min ago</span>Any tools that help you actually launch? Built my app, now crickets.</p>
                  <p className="bv-a"><span>Your draft</span>Same boat last year. I ended up building ShipItLoud for this. Happy to share what worked.</p>
                </div>
              </article>
              <article className="bt bt-ok">
                <h3>Nothing goes out without your OK.</h3>
                <span className="bt-approve" aria-hidden="true">Approve</span>
              </article>
              <article className="bt bt-digest">
                <h3>Every Monday: what worked, and your next three moves.</h3>
                <div className="bv-digest" aria-hidden="true">
                  <div className="bv-digest-h"><b>Weekly digest</b><em className="ex-tag">Example</em></div>
                  <div className="bv-digest-stats"><span><b>+112</b>signups</span><span><b>Reddit</b>top channel</span><span><b>6.8%</b>conversion</span></div>
                  <ol><li>Post the demo video on X</li><li>Reply to 4 new Reddit threads</li><li>Raise the ad cap to $25</li></ol>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="control" className="sec" aria-labelledby="ctrl-h">
          <div className="sp-wrap">
            <h2 id="ctrl-h" className="title" data-reveal>One inbox. You approve, it ships.</h2>
            <p className="kicker" data-reveal>Nothing posts, sends or spends without your OK, or the limits you set.</p>
          </div>
          <MacInbox />
        </section>

        <section id="analytics" className="sec" aria-labelledby="an-h">
          <div className="sp-wrap">
            <h2 id="an-h" className="title" data-reveal>See where every signup came from.</h2>
            <p className="kicker" data-reveal>See which posts, replies and channels bring people in, then do more of what works.</p>
            <div className="an-card" data-reveal>
              <div className="an-head">
                <div>
                  <p className="an-title">Signups by source</p>
                  <p className="an-sub">Launch week · example dashboard</p>
                </div>
                <div className="an-total">
                  <span className="an-num">{SOURCES.reduce((a, b) => a + b.value, 0)}</span>
                  <span className="an-delta">+38% vs last week</span>
                </div>
              </div>
              <div className="an-body">
                <Bars3D />
                <AnalyticsSide />
              </div>
            </div>
          </div>
        </section>

        <section id="kit" className="sec" aria-labelledby="kit-h">
          <div className="sp-wrap">
            <h2 id="kit-h" className="title" data-reveal>A launch kit you can post today.</h2>
            <p className="kicker" data-reveal>Paste your URL and get posts, posters and short videos in your brand, ready to publish. No designer, no editor, no blank page.</p>
            <ul className="kit-list" data-reveal>
              <li>Posters and feature cards</li>
              <li>30-second demo video with captions</li>
              <li>Launch posts for X, LinkedIn, Reddit and Product Hunt</li>
              <li>Waitlist page with referrals</li>
              <li>A 30-day launch plan</li>
            </ul>
            <p className="kit-proof" data-reveal>Made by ShipItLoud for its own launch:</p>
            <div className="kit-grid">
              <figure className="asset-card">
                <div className="asset a-poster">
                  <LogoIcon size={44} />
                  <div className="a-big">Don&apos;t launch<br />in <span className="loud">silence.</span></div>
                  <div className="a-foot"><span>shipitloud.com</span><span>Launch poster</span></div>
                </div>
                <figcaption><span>Launch poster, sized for Instagram</span><span className="mono">1080×1350</span></figcaption>
              </figure>
              <figure className="asset-card">
                <div className="asset a-meme">
                  <span className="a-tag">POV</span>
                  <div className="a-line">The app is done. Now you have to beg the internet to use it.</div>
                  <div className="a-term" aria-hidden="true">
                    <div className="t1">$ git push origin main</div>
                    <div className="t2 ok">✓ deployed to production</div>
                    <div className="t3">users: <span className="zero">0</span><span className="caret" /></div>
                  </div>
                  <span className="a-scrub" aria-hidden="true"><i /></span>
                </div>
                <figcaption><span>Short video for Reels and TikTok</span><span className="mono">9:16 · 12s</span></figcaption>
              </figure>
              <figure className="asset-card">
                <div className="asset a-post">
                  <div className="a-who">
                    <LogoIcon size={34} square={false} />
                    <div><b>ShipItLoud</b> <span>@shipitloud</span></div>
                  </div>
                  <div className="a-body">{'Building the product was the easy part.\n\nShipItLoud is the business co‑founder you never had: launch kit, listening, content and ads.'}</div>
                  <div className="a-attach" aria-hidden="true"><span>Don&apos;t launch in <b>silence.</b></span></div>
                  <div className="a-bar"><span className="tag">X · thread 1/4</span><span className="mono">Publish score 92</span></div>
                </div>
                <figcaption><span>Launch thread, written in your voice</span><span className="mono">X · LinkedIn</span></figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="momentum" className="sec" aria-labelledby="mom-h">
          <div className="sp-wrap telemetry-grid">
            <div>
              <h2 id="mom-h" className="title" data-reveal>We&apos;re launching with it too.</h2>
              <p className="kicker" data-reveal>
                We&apos;re launching ShipItLoud with ShipItLoud. Goal: {goal} signups in {site.goals.signupDays} days, then {site.goals.paying} paying in {site.goals.payingDays}.
              </p>
              <div className="sources" data-reveal>
                <p className="sources-h">Where signups come from</p>
                {stats.bySource.length ? (
                  <ul>
                    {stats.bySource.slice(0, 5).map((s) => (
                      <li key={s.source}>
                        <span>{s.source}</span>
                        <span className="bar"><i style={{ width: `${(s.count / Math.max(...stats.bySource.map((x) => x.count))) * 100}%` }} /></span>
                        <span className="mono">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sources-empty">No signups yet. Be the first; your referrals show up here.</p>
                )}
              </div>
            </div>
            <div className="orbit-box" aria-label={`${stats.total} of ${goal} waitlist signups`}>
              <svg viewBox="0 0 320 320" className="orbit">
                <circle cx="160" cy="160" r="130" className="orbit-track" />
                <circle cx="160" cy="160" r="130" className="orbit-fill" strokeDasharray={2 * Math.PI * 130} strokeDashoffset={2 * Math.PI * 130} transform="rotate(-90 160 160)" />
                <circle cx="160" cy="160" r="96" className="orbit-inner" />
                <g className="orbit-ship" style={{ transformOrigin: '160px 160px', transform: `rotate(${360 * pct}deg)` }}>
                  <circle cx="160" cy="30" r="7" fill="#C6FF3D" />
                </g>
              </svg>
              <div className="orbit-read">
                {stats.total >= 25 ? (
                  <>
                    <span className="orbit-num mono" data-total>{stats.total.toLocaleString('en-US')}</span>
                    <span className="orbit-of mono">/ {goal} signups</span>
                    <span className="orbit-week mono">+{stats.last7} this week</span>
                  </>
                ) : (
                  <>
                    <span className="orbit-num orbit-day">Day 0</span>
                    <span className="orbit-of">The waitlist just opened</span>
                    <span className="orbit-week">{stats.total ? `${stats.total} early ${stats.total === 1 ? 'signup' : 'signups'} so far` : 'Be one of the first'}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="sec">
          <div className="sp-wrap">
            <PricingSpace />
          </div>
        </section>

        <section id="orbit" className="final-space" aria-labelledby="final-h">
          <div className="sp-wrap final-in">
            <h2 id="final-h" className="final-title" data-reveal>Don&apos;t launch in silence.<br /><span className="loud">Ship it loud.</span></h2>
            <div data-reveal>
              <Suspense>
                <JoinForm onInk meta="" />
              </Suspense>
            </div>
          </div>
          <div className="globe-wrap"><Globe /></div>
        </section>
      </main>

      <footer className="sp-footer">
        <div className="sp-wrap sp-footer-in">
          <span>© {new Date().getFullYear()} {site.legalEntity}. {site.tagline}</span>
          <nav aria-label="Legal">
            <Link href="/pricing">Pricing</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund">Refunds</Link>
            <a href={`mailto:${site.contactEmail}`}>Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
