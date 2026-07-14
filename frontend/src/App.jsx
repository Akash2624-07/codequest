import { Routes, Route, Navigate } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect } from 'react';
import { checkAuth } from './store/authSlice';

import Layout from './components/Layout';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/AdminLayout';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import CreateProblem from './pages/CreateProblem';
import ProblemPage from './pages/ProblemPage';
import AdminUsers from './pages/AdminUsers';
import AdminProblems from './pages/AdminProblems';
import EditProblem from './pages/EditProblem';

function App() {
  const dispatch = useDispatch();
  const { isAuthenticated, loading } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(checkAuth());
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <Routes>
      {/* No navbar */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" /> : <Login />}
      />
      <Route
        path="/signup"
        element={isAuthenticated ? <Navigate to="/" /> : <Signup />}
      />

      {/* Navbar wraps everything inside here */}
      <Route element={<Layout />}>
        <Route
          path="/"
          element={isAuthenticated ? <Home /> : <Navigate to="/login" />}
        />
        <Route
          path="/problems/:id"
          element={isAuthenticated ? <ProblemPage /> : <Navigate to="/login" />}
        />

        {/* Admin-only */}
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="create" element={<CreateProblem />} />
            <Route path="problems" element={<AdminProblems />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>
          <Route path="/admin/problems/:id/edit" element={<EditProblem />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
