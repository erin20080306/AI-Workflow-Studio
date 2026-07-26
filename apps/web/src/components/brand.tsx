import { PRODUCT } from '@ai-workflow-studio/shared/product';
import Link from 'next/link';

import { SparkIcon } from './icons';

interface BrandProps {
  readonly compact?: boolean;
  readonly href?: string;
  readonly inverse?: boolean;
}

export function Brand({ compact = false, href = '/', inverse = false }: BrandProps) {
  return (
    <Link
      aria-label={`${PRODUCT.displayName} home`}
      className="inline-flex items-center gap-2.5"
      href={href}
    >
      <span
        className={`grid size-9 place-items-center rounded-xl ${
          inverse ? 'bg-white text-slate-950' : 'bg-slate-950 text-white'
        }`}
      >
        <SparkIcon className="size-5" />
      </span>
      {!compact && (
        <span className={`text-[15px] font-semibold tracking-tight ${inverse ? 'text-white' : ''}`}>
          {PRODUCT.displayName}
        </span>
      )}
    </Link>
  );
}
