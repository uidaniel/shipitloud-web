-- GitHub is opt-in: issue trackers rarely fit non-developer products, and unauthenticated search is tightly rate limited.
alter table listen_configs alter column sources set default '{hn,bluesky}';
