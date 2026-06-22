import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../api";
import { authClient } from "../authClient";
import { AppHeader } from "../components/dashboard/AppHeader";
import { CreateProjectForm } from "../components/dashboard/CreateProjectForm";
import { ImportProjectForm } from "../components/dashboard/ImportProjectForm";
import { ProjectList } from "../components/dashboard/ProjectList";

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects
  });

  const createProjectMutation = useMutation({
    mutationFn: api.createProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: api.deleteProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const duplicateProjectMutation = useMutation({
    mutationFn: api.duplicateProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    }
  });

  const importProjectMutation = useMutation({
    mutationFn: api.importProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    }
  });

  return (
    <main className="min-h-screen">
      <AppHeader
        email={session.data?.user.email ?? ""}
        onRefresh={() => void projectsQuery.refetch()}
        onSignOut={() => {
          void authClient.signOut().then(async () => {
            queryClient.clear();
            await navigate({ to: "/auth" });
          });
        }}
      />
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-semibold">Projects</h2>
            <p className="text-xs text-muted-foreground">Create a new project or import an archive.</p>
          </div>
          <div className="flex items-center gap-2">
          <CreateProjectForm onCreate={(input) => createProjectMutation.mutateAsync(input).then(() => undefined)} />
          <ImportProjectForm importing={importProjectMutation.isPending} onImport={(input) => importProjectMutation.mutateAsync(input).then(() => undefined)} />
          </div>
        </div>
        <ProjectList
          projects={projectsQuery.data ?? []}
          loading={projectsQuery.isPending}
          duplicatingProjectId={duplicateProjectMutation.isPending ? duplicateProjectMutation.variables : null}
          onDuplicate={(projectId) => duplicateProjectMutation.mutateAsync(projectId).then(() => undefined)}
          onDelete={(projectId) => deleteProjectMutation.mutateAsync(projectId).then(() => undefined)}
        />
      </section>
    </main>
  );
}
