'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-xl font-semibold text-rose-700">
          !
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
          無法載入這個畫面
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          我們保留了安全的錯誤識別資訊，但不會在瀏覽器顯示堆疊、權杖或系統路徑。
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
            onClick={reset}
            type="button"
          >
            再試一次
          </button>
          <Link
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
            href="/"
          >
            返回首頁
          </Link>
        </div>
      </div>
    </main>
  );
}
