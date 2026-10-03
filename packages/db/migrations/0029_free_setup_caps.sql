-- PRD section 24: the free setup delivers real first wins (first week of posts, launch messages, warm leads) before
-- any paywall. Free gets a small monthly allowance for that; scheduling, videos and the digest stay paid.
update plan_limits set monthly_cap = 20 where plan = 'free' and metric = 'ai_drafts';
update plan_limits set monthly_cap = 2 where plan = 'free' and metric = 'monitors';
