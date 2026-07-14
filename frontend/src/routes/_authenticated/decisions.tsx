import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDecisions } from "@/lib/tasks.functions";
import { searchDecisions } from "@/lib/ai.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/decisions")({
  head: () => ({ meta: [{ title: "Decisions — AI Meeting Operator" }] }),
  component: DecisionsPage,
});

function DecisionsPage() {
  const listFn = useServerFn(listDecisions);
  const searchFn = useServerFn(searchDecisions);
  const { data } = useQuery({ queryKey: ["decisions"], queryFn: () => listFn() });

  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const r = await searchFn({ data: { query: q.trim() } });
      setResults(r as any[]);
    } finally {
      setSearching(false);
    }
  }

  const list = results ?? data ?? [];

  return (
    <>
      <PageHeader
        title="Decisions"
        description="Every finalized decision, searchable in natural language"
      />
      <PageBody>
        <form onSubmit={runSearch} className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="e.g. 'what did we decide about the auth migration?'"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={searching}>
            <Sparkles className="mr-1 h-4 w-4" />
            {searching ? "Searching…" : "AI search"}
          </Button>
          {results && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                setResults(null);
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {list.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            {results
              ? "No matching decisions."
              : "Decisions extracted from your meetings appear here."}
          </Card>
        ) : (
          <div className="grid gap-3">
            {list.map((d: any) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 font-medium">{d.statement}</p>
                  {typeof d.similarity === "number" && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {Math.round(d.similarity * 100)}% match
                    </span>
                  )}
                </div>
                {d.context && (
                  <p className="mt-1 text-sm text-muted-foreground">{d.context}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {d.tags?.map((t: string) => (
                    <span key={t} className="rounded bg-secondary px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                  {d.meeting_id && (
                    <Link
                      to="/meetings/$meetingId"
                      params={{ meetingId: d.meeting_id }}
                      className="ml-auto text-primary hover:underline"
                    >
                      {d.meetings?.title ?? "View source meeting"} →
                    </Link>
                  )}
                  {!d.meeting_id && d.created_at && (
                    <span className="ml-auto">
                      {format(new Date(d.created_at), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}