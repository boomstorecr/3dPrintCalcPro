import { NavLink, Outlet } from 'react-router-dom';

const SETTINGS_TABS = [
  { label: 'Company Profile', to: '/settings/profile' },
  { label: 'Energy & Costs', to: '/settings/energy' },
  { label: 'Materials', to: '/settings/materials' },
  { label: 'Team', to: '/settings/team' },
];

function getTabClassName(isActive) {
  const baseClass =
    'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200';

  if (isActive) {
    return `${baseClass} bg-slate-900 text-white shadow-sm`;
  }

  return `${baseClass} bg-slate-100 text-slate-700 hover:bg-slate-200`;
}

export default function SettingsLayout() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Manage company-wide configuration and operational defaults.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <nav className="inline-flex min-w-full gap-2 pb-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-1" aria-label="Settings sections">
            {SETTINGS_TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) => getTabClassName(isActive)}
                end={tab.to === '/settings/profile'}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  );
}