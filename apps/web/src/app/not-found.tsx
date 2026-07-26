import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">404</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
          找不到這個頁面
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          連結可能已更新，或這個功能尚未在目前階段啟用。
        </p>
        <Link
          className="mt-7 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          href="/dashboard"
        >
          返回控制台
        </Link>
      </div>
    </main>
  );
}
