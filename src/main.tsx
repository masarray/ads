import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AppShell } from "./components/cockpit/AppShell";
import "./styles.css";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AppShell,
});

const routeTree = rootRoute.addChildren([indexRoute]);

function getRouterBasepath() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const normalized = baseUrl.replace(/\/+$/, "");

  // TanStack Router expects "/" for root, but "/ads" for GitHub Pages.
  if (!normalized || normalized === ".") return "/";
  return normalized;
}

const router = createRouter({
  routeTree,
  basepath: getRouterBasepath(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
