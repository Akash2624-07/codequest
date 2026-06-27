import { Outlet } from 'react-router';
import Navbar from './Navbar';

function Layout() {
  return (
    <div className="min-h-screen bg-base-200 flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
