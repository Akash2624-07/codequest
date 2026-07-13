import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router';
import { Code2, LogOut, PlusCircle } from 'lucide-react';
import { logoutUser } from '../store/authSlice';

function Navbar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const handleLogout = async() =>{
    try{
      await dispatch(logoutUser());
      navigate('/login');
    }
    catch(err){
      console.log(err);
    }
  }

  const initial = user?.firstName?.[0]?.toUpperCase() ?? user?.emailId?.[0]?.toUpperCase() ?? 'U';
  const displayName = user?.firstName ?? user?.emailId ?? 'User';

  return (
    <div className="navbar bg-base-100 border-b border-base-200 px-6">
      <div className="flex-1">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary">
          <Code2 size={22} />
          CodeQuest
        </Link>
      </div>

      <div className="flex-none gap-2">
        <div className="dropdown dropdown-end">
          <div
            tabIndex={0}
            role="button"
            className="btn btn-ghost btn-circle avatar placeholder"
          >
            <div className="bg-primary text-primary-content rounded-full w-9 h-9 flex items-center justify-center">
              <span className="text-sm font-bold leading-none">{initial}</span>
            </div>
          </div>

          <ul
            tabIndex={0}
            className="menu menu-sm dropdown-content bg-base-100 rounded-box z-10 mt-3 w-52 p-2 shadow border border-base-200"
          >
            <li className="px-3 py-2 text-sm font-semibold text-base-content/70 cursor-default select-none">
              {displayName}
            </li>
            <div className="divider my-0" />
            {user?.role === 'admin' && (
              <li>
                <Link to="/admin/create" className="flex items-center gap-2">
                  <PlusCircle size={15} />
                  New Problem
                </Link>
              </li>
            )}
            <li>
              <button
                onClick={handleLogout}
                className="text-error flex items-center gap-2"
              >
                <LogOut size={15} />
                Logout
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
