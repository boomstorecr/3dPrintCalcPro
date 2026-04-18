import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Plus, List, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Sidebar({ isOpen, setIsOpen }) {
  const navigate = useNavigate();
  const { logout, userProfile } = useAuth();

  const navItems = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'New Quote', href: '/quotes/new', icon: Plus },
    { name: 'Quote History', href: '/quotes', icon: List },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900 bg-opacity-50 transition-opacity md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar fixed left */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 flex flex-col pt-5 pb-4 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-shrink-0 items-center px-4">
          <span className="text-xl font-bold text-white tracking-tight leading-none bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            3DPrintCalc Pro
          </span>
        </div>

        <div className="mt-8 flex flex-1 flex-col overflow-y-auto">
          <nav className="flex-1 space-y-1 px-2">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`
                }
              >
                <item.icon
                  className="mr-3 flex-shrink-0 h-5 w-5 text-slate-400 group-hover:text-slate-300"
                  aria-hidden="true"
                />
                {item.name}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User / Logout area */}
        <div className="flex flex-shrink-0 border-t border-slate-700 p-4">
          <div className="flex items-center w-full">
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-white shadow-inner border border-slate-600">
                U
              </div>
            </div>
            <div className="ml-3 flex flex-1 flex-col justify-center min-w-0">
              <p className="truncate text-sm font-medium text-white">{userProfile?.name || 'Default User'}</p>
              <button
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                className="flex text-xs font-medium text-slate-400 hover:text-white items-center gap-1 transition-colors outline-none text-left"
              >
                <LogOut className="h-3 w-3" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
