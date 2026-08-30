-- The FBISE crawler (scripts/crawl.ts, data/crawl-sources.json) tags every source it produces
-- as sourceType: "model_paper" — FBISE's official "Assessment Framework + Model Question Paper"
-- PDFs, which are neither a textbook nor a past exam paper nor a marking scheme. Without this
-- row, chapter_sources' foreign key to source_types rejects every one of the 34 crawled sources
-- at ingest time.
insert into source_types (source_type, description) values
  ('model_paper', 'Official board assessment framework and model question paper')
on conflict do nothing;
