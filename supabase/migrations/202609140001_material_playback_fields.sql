-- Video / link preview fields for方案 A embed playback + caption/subtitles.
alter table public.materials
  add column if not exists caption_text text,
  add column if not exists subtitle_text text,
  add column if not exists playback_mode text
    check (playback_mode is null or playback_mode in ('embed', 'external_url', 'none')),
  add column if not exists playback_url text,
  add column if not exists playback_embed_html text;
