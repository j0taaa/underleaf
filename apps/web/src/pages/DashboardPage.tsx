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
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <CreateProjectForm onCreate={(input) => createProjectMutation.mutateAsync(input).then(() => undefined)} />
          <ImportProjectForm importing={importProjectMutation.isPending} onImport={(input) => importProjectMutation.mutateAsync(input).then(() => undefined)} />
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
