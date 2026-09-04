-- Drops marking-scheme support entirely: the crawler never produced this source type (its own
-- CrawlSource/SourceDocument unions in scripts/crawl.ts only ever allowed textbook/past_paper/
-- model_paper), so the 59 chapter_sources rows that existed here were created outside the
-- tracked pipeline. Most of those chapters are shared with a real past_paper/model_paper source
-- for the same year (e.g. "Marking Scheme 2023 — biology" also holds that year's past paper), so
-- only the marking_scheme chapter_sources rows are removed — never the chapters themselves,
-- except the two that had no other source at all.

-- 1. Delete the marking_scheme chapter_sources rows. Cascades to their sections and
--    content_chunks (both ON DELETE CASCADE — see 0001_init.sql).
delete from chapter_sources where source_type = 'marking_scheme';

-- 2. The two chapters that existed solely to hold a marking_scheme source now have zero
--    sources left — remove them too, rather than leaving an empty, unreachable chapter row.
delete from chapters
where id in (
  '7c597144-1362-4989-ba11-54ab3e2b0906', -- Marking Scheme 2024 — physics, FBISE G11
  'c78395f4-3c62-4d30-8605-fed6d3be01e7'  -- Marking Scheme 2023 — computer science, FBISE G12
)
and not exists (select 1 from chapter_sources where chapter_sources.chapter_id = chapters.id);

-- 3. Remove the lookup row itself so 'marking_scheme' can never be inserted as a source_type
--    again (chapter_sources.source_type is a foreign key into this table).
delete from source_types where source_type = 'marking_scheme';
