import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../api";
import { AppHeader } from "../components/dashboard/AppHeader";
import { CreateProjectForm } from "../components/dashboard/CreateProjectForm";
import { ProjectList } from "../components/dashboard/ProjectList";

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  return (
    <main className="min-h-screen">
      <AppHeader onRefresh={() => void projectsQuery.refetch()} />
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <CreateProjectForm onCreate={(input) => createProjectMutation.mutateAsync(input).then(() => undefined)} />
        <ProjectList
          projects={projectsQuery.data ?? []}
          loading={projectsQuery.isPending}
          onDelete={(projectId) => deleteProjectMutation.mutateAsync(projectId).then(() => undefined)}
        />
      </section>
    </main>
  );
}
