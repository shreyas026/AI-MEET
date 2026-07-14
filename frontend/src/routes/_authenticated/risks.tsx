import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRisks } from "@/lib/tasks.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { SeverityPill } from "@/components/status-pill";

export const Route = createFileRoute("/_authenticated/risks")({
  head: () => ({ meta: [{ title: "Risks — AI Meeting Operator" }] }),
  component: RisksPage,
});

function RisksPage() {
  const listFn = useServerFn(listRisks);
  const { data } = useQuery({ queryKey: ["risks"], queryFn: () => listFn() });

  const grouped: Record<string, any[]> = { high: [], medium: [], low: [] };
  for (const r of data ?? []) grouped[r.severity]?.push(r);

  return (
    <>
      <PageHeader
        title="Risks"
        description="Early warnings the AI detected across your meetings"
      />
      <PageBody>
        {(data?.length ?? 0) === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            No risks flagged yet. AI-detected risks appear here as you analyze meetings.
          </Card>
        ) : (
          <div className="space-y-8">
            {(["high", "medium", "low"] as const).map((sev) =>
              grouped[sev].length > 0 ? (
                <section key={sev}>
                  <div className="mb-3 flex items-center gap-2">
                    <SeverityPill severity={sev} />
                    <span className="text-sm text-muted-foreground">
                      {grouped[sev].length} risk{grouped[sev].length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {grouped[sev].map((r: any) => (
                      <Card key={r.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 font-medium">{r.description}</p>
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                            {r.category}
                          </span>
                        </div>
                        {r.mitigation && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Mitigation:</span>{" "}
                            {r.mitigation}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {r.projects?.name && (
                            <span className="rounded bg-secondary px-1.5 py-0.5">
                              {r.projects.name}
                            </span>
                          )}
                          {r.meeting_id && (
                            <Link
                              to="/meetings/$meetingId"
                              params={{ meetingId: r.meeting_id }}
                              className="ml-auto text-primary hover:underline"
                            >
                              {r.meetings?.title ?? "View meeting"} →
                            </Link>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ) : null,
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}