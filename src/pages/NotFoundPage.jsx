import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center text-center">
        <p className="text-7xl font-extrabold tracking-tight text-slate-900 sm:text-8xl">{t('notFound.code')}</p>
        <h1 className="mt-4 text-2xl font-semibold text-slate-800 sm:text-3xl">{t('notFound.title')}</h1>
        <p className="mt-3 max-w-md text-sm text-slate-600 sm:text-base">
          {t('notFound.subtitle')}
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          {t('notFound.backToDashboard')}
        </Link>
      </section>
    </main>
  );
}

export default NotFoundPage;
