import { Routes, Route, Navigate } from 'react-router';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { checkAuth } from './store/authSlice';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect } from 'react';

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
    <>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated ? <Home /> : <Navigate to="/signup" />}
        ></Route>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" /> : <Login />}
        ></Route>
        <Route
          path="/signup"
          element={isAuthenticated ? <Navigate to="/" /> : <Signup />}
        ></Route>
      </Routes>
    </>
  );
}

export default App;
