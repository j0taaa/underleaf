import { Navigate, Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectEditorPage } from "./pages/ProjectEditorPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectEditorPage
});

const routeTree = rootRoute.addChildren([indexRoute, projectRoute]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => <Navigate to="/" replace />
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
