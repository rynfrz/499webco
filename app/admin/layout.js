// Passthrough. Auth gating happens in the (authed) route group layout so that
// /admin/login and /admin/setup are reachable without a session.
export default function AdminLayout({ children }) {
  return children;
}
