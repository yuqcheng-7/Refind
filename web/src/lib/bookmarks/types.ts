export type Bookmark = {
  id: string;
  url: string;
  collection_id: string | null;
  source_platform: string | null;
  title: string | null;
  author: string | null;
  excerpt: string | null;
  summary: string | null;
  preview_image_url: string | null;
  ai_status: "pending" | "done" | "failed" | string;
  ai_error: string | null;
  created_at: string;
};

export type BookmarkWithTags = Bookmark & { tags: string[] };

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Collection = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

