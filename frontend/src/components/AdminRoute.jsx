import { useSelector } from 'react-redux';
import { Navigate, Outlet } from 'react-router';

// Guards admin-only routes. Auth is already enforced upstream, but we re-check
// here so a direct navigation to an admin URL can't slip through.
function AdminRoute() {
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  return <Outlet />;
}

export default AdminRoute;
