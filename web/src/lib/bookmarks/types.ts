export type Bookmark = {
  id: string;
  url: string;
  source_platform: string | null;
  title: string | null;
  excerpt: string | null;
  summary: string | null;
  ai_status: "pending" | "done" | "failed" | string;
  ai_error: string | null;
  created_at: string;
};

export type BookmarkWithTags = Bookmark & { tags: string[] };

