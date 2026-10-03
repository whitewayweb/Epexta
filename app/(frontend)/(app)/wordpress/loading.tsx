import { TablePageSkeleton } from "@/components/page-skeleton";

// Sits inside wordpress/layout.tsx, so the inner sidebar stays put while the content loads.
export default function WordPressLoading() {
  return <TablePageSkeleton />;
}
