import { Menu } from 'lucide-react';

export default function Topbar({ setIsSidebarOpen }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 flex-shrink-0 bg-white shadow-sm border-b border-slate-200">
      <button
        type="button"
        className="border-r border-slate-200 px-4 text-slate-500 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 md:hidden transition-colors"
        onClick={() => setIsSidebarOpen(true)}
      >
        <span className="sr-only">Open sidebar</span>
        <Menu className="h-6 w-6" aria-hidden="true" />
      </button>

      <div className="flex flex-1 items-center justify-between px-4 sm:px-6">
        <div className="flex flex-1 items-center">
          <div className="flex flex-shrink-0 items-center md:hidden">
            <span className="text-lg font-bold text-slate-900 tracking-tight leading-none bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              3DPrintCalc
            </span>
          </div>
        </div>

        <div className="ml-4 flex items-center md:ml-6 space-x-4">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-sm font-semibold text-slate-900 leading-none">
              Default User
            </span>
            <span className="text-xs font-medium text-slate-500">
              Admin
            </span>
          </div>
          <button
            type="button"
            className="flex max-w-xs items-center rounded-full bg-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-shadow"
          >
            <span className="sr-only">Open user menu</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold border border-blue-200">
              U
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
