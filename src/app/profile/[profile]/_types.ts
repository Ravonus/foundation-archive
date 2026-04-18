import { type ArtworkGridItem } from "~/app/_components/artwork-grid";

export type ProfilePageProps = {
  params: Promise<{
    profile: string;
  }>;
  searchParams: Promise<{
    view?: string;
  }>;
};

export type ResolvedProfile = {
  accountAddress: string;
  username: string | null;
  name: string | null;
  profileImageUrl: string | null;
  bio: string | null;
  coverImageUrl: string | null;
};

export type ProfileItemCounts = {
  total: number;
  saved: number;
  syncing: number;
  found: number;
};

export type PartitionedItems = {
  items: ArtworkGridItem[];
  counts: ProfileItemCounts;
};
