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
import { Bars3D, SOURCES } from './bars-3d';
import { Globe } from './globe';
import { MacInbox } from './mac-inbox';
import { LAUNCHED_EVENT, Preloader, hasLaunched } from './preloader';
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

const story = [
  'Building it was the hard part.',
  'Getting users shouldn’t be.',
  'ShipItLoud reads your product, then writes your posts, makes your videos, finds people asking for what you built and drafts the replies.',
  'You approve. We do the marketing.',
];

const stages = [
  {
    tag: 'Stage 1',
    name: 'Launch',
    line: 'Paste your URL. Get the whole kit in minutes.',
    items: ['Brand brain from your site', 'Waitlist page with referrals', 'Demo video, posters, launch posts', '30-day launch plan'],
  },
  {
    tag: 'Stage 2',
    name: 'Grow',
    line: 'Marketing that keeps running after launch day.',
    items: ['Finds people asking for what you built', 'Drafts replies in your voice', 'Content, SEO blog and short videos', 'Ads autopilot with hard spend caps'],
  },
  {
    tag: 'Every week',
    name: 'Mission control',
    line: 'What happened, what worked, your next three moves.',
    items: ['One approval inbox', 'Trust mode for routine posts', 'Signups tracked by source', 'Kill switch on every spend'],
  },
];


export function LaunchPage({ stats }: { stats: WaitlistStats }) {
  const root = useRef<HTMLDivElement>(null);
  const goal = site.goals.signups;
  const pct = Math.min(1, stats.total / goal);

  // Smooth scroll; its velocity drives the starfield streaks.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.09, anchors: { offset: -72 } });
    const start = () => lenis.start();
    if (!hasLaunched()) { lenis.stop(); window.addEventListener(LAUNCHED_EVENT, start, { once: true }); }
    lenis.on('scroll', (e: Lenis) => {
      motion.velocity = e.velocity;
      ScrollTrigger.update();
    });
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener(LAUNCHED_EVENT, start);
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
        const play = () => intro.play();
        if (hasLaunched()) requestAnimationFrame(play);
        else window.addEventListener(LAUNCHED_EVENT, play, { once: true });
        intro
          .from('.sp-hero .ch', { yPercent: 115, autoAlpha: 0, duration: 0.9, stagger: 0.022 }, 0.1)
          .from('.hero-title .loud', { scaleX: 0, transformOrigin: '0% 50%', duration: 0.7, ease: 'power3.out' }, 0.3)
          .from('.hero-sub, .hero-form, .hero-meta', { y: 24, autoAlpha: 0, duration: 0.8, stagger: 0.08 }, 0.55)

        // ---- the hero drifts up and fades as you scroll away
        gsap.timeline({ scrollTrigger: { trigger: '.sp-hero', start: 'top top', end: 'bottom top', scrub: 0.6 } })
          .to('.hero-copy', { y: -80, autoAlpha: 0, ease: 'none' }, 0)

        // ---- the story: lines light up as you read
        gsap.timeline({ scrollTrigger: { trigger: '.story', start: 'top top', end: '+=180%', scrub: 0.5, pin: true } })
          .from('.story-line', { autoAlpha: 0.12, y: 30, stagger: 0.6, duration: 0.6, ease: 'power2.out' });

        // ---- flight path draws through the stages
        const path = root.current!.querySelector<SVGPathElement>('.flight-path');
        if (path) {
          const len = path.getTotalLength();
          gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, {
            strokeDashoffset: 0,
            ease: 'none',
            scrollTrigger: { trigger: '.stages', start: 'top 75%', end: 'bottom 70%', scrub: 0.5 },
          });
        }
        // Desktop: cards rise in. Phones: cards stick and stack, each new one sliding over the last.
        mm.add('(min-width: 900px)', () => {
          gsap.utils.toArray<HTMLElement>('.stage').forEach((el) => {
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
        mm.add('(max-width: 899px)', () => stack('.stage'));
        mm.add('(max-width: 679px)', () => stack('[data-plan]'));

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
      <Preloader />

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
            {story.map((s, i) => (
              <p key={i} className={`story-line${i === story.length - 1 ? ' story-last' : ''}`}>{s}</p>
            ))}
          </div>
        </section>

        <section id="how" className="sec" aria-labelledby="how-h">
          <div className="sp-wrap">
            <p className="eyebrow" data-reveal>How it works</p>
            <h2 id="how-h" className="title" data-reveal>Two stages. <span className="dim">One co‑founder.</span></h2>
            <div className="stages">
              <svg className="flight" viewBox="0 0 1200 220" preserveAspectRatio="none" aria-hidden="true">
                <path className="flight-ghost" d="M0 200 C 300 200, 420 40, 620 70 S 1000 10, 1200 20" />
                <path className="flight-path" d="M0 200 C 300 200, 420 40, 620 70 S 1000 10, 1200 20" />
              </svg>
              {stages.map((s) => (
                <article key={s.name} className="stage">
                  <span className="stage-tag">{s.tag}</span>
                  <h3 className="stage-name">{s.name}</h3>
                  <p className="stage-line">{s.line}</p>
                  <ul className="stage-list">
                    {s.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="control" className="sec" aria-labelledby="ctrl-h">
          <div className="sp-wrap">
            <p className="eyebrow" data-reveal>Mission control</p>
            <h2 id="ctrl-h" className="title" data-reveal>You approve. <span className="dim">It ships.</span></h2>
            <p className="kicker" data-reveal>Nothing posts, sends or spends without your OK, or the limits you set.</p>
          </div>
          <MacInbox />
        </section>

        <section id="analytics" className="sec" aria-labelledby="an-h">
          <div className="sp-wrap">
            <p className="eyebrow" data-reveal>Analytics</p>
            <h2 id="an-h" className="title" data-reveal>Know what&apos;s working. <span className="dim">Every signup, traced.</span></h2>
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
              <Bars3D />
            </div>
          </div>
        </section>

        <section id="kit" className="sec" aria-labelledby="kit-h">
          <div className="sp-wrap">
            <p className="eyebrow" data-reveal>What you get</p>
            <h2 id="kit-h" className="title" data-reveal>Your launch kit, <span className="dim">ready in minutes.</span></h2>
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
                    <div>$ git push origin main</div>
                    <div className="ok">✓ deployed to production</div>
                    <div>users: <span className="zero">0</span><span className="caret" /></div>
                  </div>
                </div>
                <figcaption><span>Short video for Reels and TikTok</span><span className="mono">9:16 · 12s</span></figcaption>
              </figure>
              <figure className="asset-card">
                <div className="asset a-post">
                  <div className="a-who">
                    <LogoIcon size={34} square={false} />
                    <div><b>ShipItLoud</b> <span>@shipitloud</span></div>
                  </div>
                  <div className="a-body">{'Building the product was the easy part.\n\nShipItLoud is the business co‑founder you never had: launch kit, listening, content and ads.\n\nYou approve. It ships.'}</div>
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
              <p className="eyebrow" data-reveal>Telemetry</p>
              <h2 id="mom-h" className="title" data-reveal>Built in public. <span className="dim">Live numbers.</span></h2>
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
                <span className="orbit-num mono" data-total>{stats.total.toLocaleString('en-US')}</span>
                <span className="orbit-of mono">/ {goal} signups</span>
                <span className="orbit-week mono">+{stats.last7} this week</span>
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
            <p className="eyebrow" data-reveal>Your launch window is open</p>
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
