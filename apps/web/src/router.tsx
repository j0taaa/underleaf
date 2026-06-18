import type { ReactNode } from "react";
import { Navigate, Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { authClient } from "./authClient";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectEditorPage } from "./pages/ProjectEditorPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  )
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: () => (
    <ProtectedRoute>
      <ProjectEditorPage />
    </ProtectedRoute>
  )
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: AuthPage
});

const routeTree = rootRoute.addChildren([indexRoute, projectRoute, authRoute]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => <Navigate to="/" replace />
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  if (session.isPending) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading
      </main>
    );
  }
  if (!session.data) return <Navigate to="/auth" replace />;
  return children;
}
