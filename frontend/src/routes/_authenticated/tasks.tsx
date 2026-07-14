import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTasks, updateTask } from "@/lib/tasks.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { PriorityPill } from "@/components/status-pill";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tasks — AI Meeting Operator" }] }),
  component: TasksPage,
});

const columns = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
] as const;

function TasksPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const updFn = useServerFn(updateTask);
  const { data } = useQuery({ queryKey: ["tasks"], queryFn: () => listFn() });

  async function changeStatus(id: string, status: "todo" | "in_progress" | "done") {
    await updFn({ data: { id, status } });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success("Task updated");
  }

  const grouped: Record<string, any[]> = { todo: [], in_progress: [], done: [] };
  for (const t of data ?? []) grouped[t.status]?.push(t);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything the AI pulled out of your meetings, ready to execute"
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-3">
          {columns.map((col) => (
            <div key={col.key}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {grouped[col.key].length}
                </span>
              </div>
              <div className="space-y-2">
                {grouped[col.key].length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
                    Nothing here
                  </div>
                ) : (
                  grouped[col.key].map((t: any) => {
                    const overdue =
                      t.due_date && t.due_date < today && t.status !== "done";
                    return (
                      <Card key={t.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
                            {t.title}
                          </p>
                          <PriorityPill priority={t.priority} />
                        </div>
                        {t.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {t.projects?.name && (
                            <span className="rounded bg-secondary px-1.5 py-0.5">
                              {t.projects.name}
                            </span>
                          )}
                          {t.assignee_name && <span>👤 {t.assignee_name}</span>}
                          {t.due_date && (
                            <span className={overdue ? "font-medium text-destructive" : ""}>
                              Due {format(new Date(t.due_date), "MMM d")}
                            </span>
                          )}
                        </div>
                        <div className="mt-3">
                          <Select
                            value={t.status}
                            onValueChange={(v) => changeStatus(t.id, v as any)}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todo">To do</SelectItem>
                              <SelectItem value="in_progress">In progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </PageBody>
    </>
  );
}