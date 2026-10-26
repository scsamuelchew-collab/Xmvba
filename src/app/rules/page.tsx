import type { Metadata } from "next";
import { RulesList, SLOT_DISCLAIMER, SlotBreakdown, SquadGuide } from "@/components/event-bits";
import { Card, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { requireEvent } from "@/lib/guards";

export const metadata: Metadata = { title: "Rules" };

export default async function RulesPage() {
  const { event, settings, positions } = await requireEvent();
  return (
    <div className="space-y-6">
      <PageTitle eyebrow={event.name} title="Registration Rules" />
      <RulesList settings={settings} />
      <Notice>{SLOT_DISCLAIMER}</Notice>
      <section>
        <SectionTitle>Competition slots</SectionTitle>
        <SlotBreakdown settings={settings} />
      </section>
      <section>
        <SectionTitle>Suggested squad structure</SectionTitle>
        <Card>
          <SquadGuide positions={positions} settings={settings} />
        </Card>
      </section>
    </div>
  );
}
