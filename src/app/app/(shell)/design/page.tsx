import { notFound } from "next/navigation";
import { getV2Agent } from "@/lib/ui-version";
import { DesignReview } from "@/components/v2/design/design-review";

// Internal: tokens and components for design review, for EasyStaff staff viewing as a v2 account.
export default async function DesignPage() {
  const v2 = await getV2Agent();
  if (!v2?.impersonating) notFound();
  return <DesignReview />;
}
