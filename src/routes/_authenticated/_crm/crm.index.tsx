import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_crm/crm/")({
  component: () => <Navigate to="/crm/dashboard" />,
});
