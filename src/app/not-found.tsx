import { Empty, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <Empty title="We couldn’t find that page">It may have been removed, or the link is incomplete.</Empty>
      <LinkButton href="/" full>
        Back to Find Your Team
      </LinkButton>
    </div>
  );
}
