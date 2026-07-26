import { getEnvironment } from '@/lib/env';

export function MockModeBadge() {
  const environment = getEnvironment();

  if (!environment.mockMode) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
      <span className="size-1.5 rounded-full bg-amber-500" />
      Mock mode
    </span>
  );
}
