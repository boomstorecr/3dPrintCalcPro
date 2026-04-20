import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function getTabClassName(isActive) {
  const baseClass =
    'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200';

  if (isActive) {
    return `${baseClass} bg-slate-900 text-white shadow-sm`;
  }

  return `${baseClass} bg-slate-100 text-slate-700 hover:bg-slate-200`;
}

export default function SettingsLayout() {
  const { t } = useTranslation();

  const settingsTabs = [
    { label: t('settings.tabs.companyProfile'), to: '/settings/profile' },
    { label: t('settings.tabs.electricity'), to: '/settings/energy' },
    { label: t('settings.tabs.printers'), to: '/settings/printers' },
    { label: t('settings.tabs.materials'), to: '/settings/materials' },
    { label: t('settings.tabs.team'), to: '/settings/team' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('settings.subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <nav className="inline-flex min-w-full gap-2 pb-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-1" aria-label="Settings sections">
            {settingsTabs.map((tab) => (
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