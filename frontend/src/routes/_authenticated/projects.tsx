import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createProject, deleteProject, listProjects } from "@/lib/projects.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Folders } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projects — AI Meeting Operator" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjects);
  const createFn = useServerFn(createProject);
  const delFn = useServerFn(deleteProject);
  const { data } = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createFn({ data: { name: name.trim(), department: dept.trim() || null } });
      setName("");
      setDept("");
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this project? Meetings will remain but lose their project link.")) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["projects"] });
  }

  return (
    <>
      <PageHeader title="Projects" description="Group meetings and tasks by initiative" />
      <PageBody>
        <Card className="mb-6 p-4">
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="pname">Project name</Label>
              <Input
                id="pname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Auth migration"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="dept">Department</Label>
              <Input
                id="dept"
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                placeholder="e.g. Engineering"
              />
            </div>
            <Button type="submit">
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </form>
        </Card>

        {(data?.length ?? 0) === 0 ? (
          <Card className="p-10 text-center">
            <Folders className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No projects yet. Create one above to organize meetings and tasks.
            </p>
          </Card>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {data!.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.department && (
                    <div className="text-xs text-muted-foreground">{p.department}</div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}