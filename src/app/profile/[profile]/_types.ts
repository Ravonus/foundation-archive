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
};

export type PartitionedItems = {
  onServerItems: ArtworkGridItem[];
  missingItems: ArtworkGridItem[];
};
