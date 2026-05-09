import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dispatcher/")({
  component: () => <Navigate to="/dashboard" />,
});
