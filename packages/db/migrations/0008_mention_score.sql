-- One score to sort and filter by: the AI score once scored, the free keyword score until then.
alter table mentions add column if not exists score integer generated always as (coalesce(relevance_score, heuristic_score)) stored;
create index if not exists mentions_score_idx on mentions (workspace_id, score desc);
