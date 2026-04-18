import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { ToastProvider } from '../contexts/ToastContext';
import ToastContainer from '../components/ui/Toast';

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        
        <div className="flex flex-1 flex-col w-0 md:pl-64 transition-all duration-300">
          <Topbar setIsSidebarOpen={setIsSidebarOpen} />
          
          <main className="flex-1 relative overflow-y-auto focus:outline-none scroll-smooth">
            <div className="py-6 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
        
        <ToastContainer />
      </div>
    </ToastProvider>
  );
}
