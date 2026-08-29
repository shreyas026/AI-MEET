import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { searchAll } from "@/lib/transcripts.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, FileText, CheckCircle2, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — AI Meeting Operator" }] }),
  component: SearchPage,
});

function highlight(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      <mark className="rounded-sm bg-yellow-200/70 px-0.5 text-foreground">{match}</mark>
      {after}
    </>
  );
}

function SearchPage() {
  const searchFn = useServerFn(searchAll);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) {
      setResults(null);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const r = await searchFn({ data: { query: q.trim() } });
      setResults(r as any);
      setSearched(true);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  const transcripts = results?.transcripts ?? [];
  const workspace = results?.workspace ?? [];
  const total = transcripts.length + workspace.length;

  return (
    <>
      <PageHeader
        title="Search"
        description="Find anything said, decided, or tasked across your meetings"
      />
      <PageBody>
        <form onSubmit={run} className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search transcripts, decisions, action items…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
          {searched && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                setResults(null);
                setSearched(false);
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {!searched && (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            Search across every transcript, decision, and action item in your workspace.
          </Card>
        )}

        {searched && total === 0 && (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            No results for "{q}". Try different keywords.
          </Card>
        )}

        {searched && total > 0 && (
          <div className="space-y-8">
            {transcripts.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                  Transcripts ({transcripts.length})
                </h2>
                <div className="space-y-3">
                  {transcripts.map((t: any) => (
                    <Link
                      key={t.id}
                      to="/meetings/$meetingId"
                      params={{ meetingId: t.meeting_id }}
                      className="block"
                    >
                      <Card className="p-4 transition hover:border-primary/40">
                        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          <span className="font-medium text-foreground">{t.meeting_title}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(t.created_at))} ago</span>
                        </div>
                        <p className="text-sm leading-relaxed text-foreground/90">
                          {highlight(t.snippet || t.content.slice(0, 300), q)}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {workspace.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                  Decisions & action items ({workspace.length})
                </h2>
                <div className="space-y-3">
                  {workspace.map((item: any, i: number) => (
                    <Link
                      key={i}
                      to="/meetings/$meetingId"
                      params={{ meetingId: item.meeting_id }}
                      className="block"
                    >
                      <Card className="p-4 transition hover:border-primary/40">
                        <div className="mb-1 flex items-center gap-2">
                          {item.kind === "decision" ? (
                            <MessageSquareText className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                          <span className="text-sm font-medium">
                            {item.kind === "decision" ? "Decision" : "Action item"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            · {item.meeting_title}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{highlight(item.title, q)}</p>
                        {item.snippet && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {highlight(item.snippet, q)}
                          </p>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
