import React from 'react';
import { Translation } from 'react-i18next';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleTryAgain = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Translation>
          {(t) => (
            <div className="min-h-screen bg-slate-50 px-4 py-10">
              <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center">
                <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
                  <div className="mb-4 flex items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl" role="img" aria-label="Error">
                      ⚠️
                    </div>
                  </div>

                  <h1 className="mb-3 text-center text-2xl font-bold text-slate-900">
                    {t('error.title')}
                  </h1>

                  <p className="mb-3 text-center text-sm text-slate-600">{t('error.subtitle')}</p>

                  <pre className="mb-6 overflow-x-auto rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
                    <code>{this.state.error?.message || 'Unknown error'}</code>
                  </pre>

                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <a
                      href="/"
                      className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {t('error.backToDashboard')}
                    </a>
                    <button
                      type="button"
                      onClick={this.handleTryAgain}
                      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      {t('error.tryAgain')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Translation>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
