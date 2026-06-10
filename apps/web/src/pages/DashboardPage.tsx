import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Project } from "../api";
import { AppHeader } from "../components/dashboard/AppHeader";
import { CreateProjectForm } from "../components/dashboard/CreateProjectForm";
import { ProjectList } from "../components/dashboard/ProjectList";

export function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const navigate = useNavigate();

  const refreshProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      setProjects(await api.listProjects());
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const createProject = async (input: { name: string; template: string }) => {
    const project = await api.createProject(input);
    navigate(`/projects/${project.id}`);
  };

  const deleteProject = async (projectId: string) => {
    await api.deleteProject(projectId);
    await refreshProjects();
  };

  return (
    <main className="min-h-screen">
      <AppHeader onRefresh={() => void refreshProjects()} />
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <CreateProjectForm onCreate={createProject} />
        <ProjectList projects={projects} loading={loadingProjects} onDelete={deleteProject} />
      </section>
    </main>
  );
}
