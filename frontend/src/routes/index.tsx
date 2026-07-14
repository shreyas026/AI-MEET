import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Mic,
  ListChecks,
  Sparkles,
  ShieldAlert,
  Search,
  Workflow,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Workflow className="h-4 w-4" />
            </span>
            AI Meeting Operator
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#why" className="hover:text-foreground">Why it matters</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80%_50%_at_50%_-10%,rgba(37,99,235,0.10),transparent_60%)]"
        />
        <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 py-24 lg:grid-cols-[1.15fr_1fr] lg:py-32">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI meeting intelligence for execution teams
            </div>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
              Every meeting, <br />
              turned into work that ships.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              AI Meeting Operator records the conversation, understands the context, and pulls out
              action items, decisions, and risks — with owners, deadlines, and priorities —
              the moment the meeting ends.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start free <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#features">See what it does</a>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-6 text-xs uppercase tracking-wider text-muted-foreground">
              <span>Upload or record</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>Natural-language deadlines</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>Semantic decision search</span>
            </div>
          </div>

          {/* Product mock */}
          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 to-transparent blur-2xl" />
            <div className="rounded-2xl border border-border bg-card shadow-xl shadow-primary/5">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                </div>
                <span className="ml-2">Q4 kickoff · 42 min</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <MockPanel title="Action items" count={7} accent="bg-primary" />
                <MockPanel title="Decisions" count={4} accent="bg-emerald-500" />
                <MockPanel title="Risks" count={2} accent="bg-amber-500" />
                <MockPanel title="Summary" count={5} accent="bg-slate-400" />
              </div>
              <div className="border-t border-border p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Extracted action item
                </p>
                <p className="mt-2 text-sm font-medium">
                  Priya: ship auth migration by next Friday (high priority)
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md bg-secondary px-2 py-0.5">Backend</span>
                  <span>Due Nov 22</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Features</p>
          <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">
            Built for the moment the meeting ends.
          </h2>
          <p className="mt-4 text-muted-foreground">
              Traditional notes lose context, ownership, and deadlines. AI Meeting Operator keeps every
            commitment structured, searchable, and assigned.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={<Mic className="h-5 w-5" />}
            title="Record or upload"
            body="Capture audio in-browser or drop in an mp3/wav/webm. Streaming transcription runs the moment upload finishes."
          />
          <Feature
            icon={<ListChecks className="h-5 w-5" />}
            title="Action items with owners"
            body="AI parses grammar and context to pull tasks, assign them to the person named, and set priority — automatically."
          />
          <Feature
            icon={<Sparkles className="h-5 w-5" />}
            title="Natural-language deadlines"
            body='"Next Friday", "before the release", "in two weeks" — resolved to real calendar dates.'
          />
          <Feature
            icon={<Search className="h-5 w-5" />}
            title="Searchable decisions"
            body="Every finalized decision is stored in a semantic knowledge base. Ask 'What did we decide about auth?' and get answers."
          />
          <Feature
            icon={<ShieldAlert className="h-5 w-5" />}
            title="Early risk detection"
            body="Delays, resource crunches, dependencies, budget concerns — flagged with severity before they blow up."
          />
          <Feature
            icon={<Workflow className="h-5 w-5" />}
            title="Kanban that stays in sync"
            body="Extracted tasks land on a workspace board. Reassign, comment, and update status — no double entry."
          />
        </div>
      </section>

      {/* How */}
      <section id="how" className="border-y border-border/60 bg-secondary/50">
        <div className="mx-auto w-full max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Flow</p>
            <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">
              Four steps. Zero notes app.
            </h2>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-4">
            {[
              { n: "01", t: "Capture", b: "Record live or upload the meeting audio." },
              { n: "02", t: "Transcribe", b: "Streaming speech-to-text builds the transcript in real time." },
              { n: "03", t: "Extract", b: "GPT-class AI produces action items, decisions, risks, and a summary." },
              { n: "04", t: "Execute", b: "Tasks appear on the kanban. Decisions become searchable memory." },
            ].map((s) => (
              <li key={s.n} className="rounded-xl border border-border bg-card p-6">
                <div className="font-display text-sm text-primary">{s.n}</div>
                <div className="mt-3 font-display text-lg font-semibold">{s.t}</div>
                <p className="mt-2 text-sm text-muted-foreground">{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why */}
      <section id="why" className="mx-auto w-full max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Why</p>
            <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">
              Bridge the gap between what was said and what gets done.
            </h2>
            <p className="mt-6 text-muted-foreground">
              In most organizations, meetings dissolve into memory. AI Meeting Operator transforms
              spoken conversation into structured organizational knowledge — searchable,
              assignable, and accountable.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat n="98%" label="of action items captured automatically" />
            <Stat n="0 min" label="of manual minute-taking after meetings" />
            <Stat n="42%" label="faster follow-through on assigned tasks" />
            <Stat n="1×" label="place where every decision lives" />
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-gradient-to-b from-secondary/40 to-background">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold md:text-4xl">
            Stop taking notes. Start executing.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Your first meeting is free. It takes two minutes to see extracted action items
            from a real conversation.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create your workspace
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} AI Meeting Operator · Meeting intelligence for execution teams
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 transition hover:border-primary/40">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="font-display text-3xl font-semibold text-primary">{n}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function MockPanel({ title, count, accent }: { title: string; count: number; accent: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className={`h-2 w-2 rounded-full ${accent}`} />
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">{count}</div>
    </div>
  );
}
