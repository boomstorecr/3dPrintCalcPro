import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          3DPrintCalc Pro
        </h2>
      </div>

      <div className="mt-8 flex justify-center w-full sm:mx-auto sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-4 sm:px-10 shadow w-full sm:rounded-lg border border-slate-100">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
