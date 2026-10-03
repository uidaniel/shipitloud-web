-- PRD v6, section 23 "App links": App Store and Google Play links in setup. Listings say less than websites, so we
-- read everything in the listing (incl. reviews), ask 3 quick questions, accept an optional screen recording and an
-- optional website, and produce app-specific outputs (App Store optimization, install tracking).
alter table setup_progress drop constraint if exists setup_progress_step_check;
alter table setup_progress add constraint setup_progress_step_check check (step in ('paste','understand','questions','summary','analysis','channels','connect','wins','live'));
alter table workspaces add column if not exists app_links jsonb not null default '{}'::jsonb;   -- { apple, google }
alter table workspaces add column if not exists setup_answers jsonb;                              -- { who, does, different }
alter table brand_kits add column if not exists recording jsonb;                                  -- { url, seconds, path }
alter table growth_analyses add column if not exists listing jsonb;         -- store, rating, reviews count, icon, screenshots, similar
alter table growth_analyses add column if not exists aso jsonb;             -- { title, subtitle, keywords, screenshots: [{ order, caption }] }
alter table growth_analyses add column if not exists review_themes jsonb;   -- { loves: [], complaints: [] }
alter table growth_analyses add column if not exists questions jsonb;       -- { who: [], does: [], different: [] } suggested answers
alter table growth_analyses add column if not exists needs_questions boolean not null default false;
