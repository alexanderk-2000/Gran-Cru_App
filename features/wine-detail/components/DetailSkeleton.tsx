import { memo } from 'react';
import { LUXURY_BG } from '../colors.ts';

export const DetailSkeleton = memo(function DetailSkeleton() {
  return (
    <div className="min-h-screen px-6 pb-14 pt-8" style={{ backgroundColor: LUXURY_BG }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-44 animate-pulse rounded-3xl border border-stone-200 bg-white" />
        <div className="h-12 animate-pulse rounded-2xl border border-stone-200 bg-white" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-56 animate-pulse rounded-3xl border border-stone-200 bg-white md:col-span-2" />
          <div className="h-56 animate-pulse rounded-3xl border border-stone-200 bg-white" />
        </div>
      </div>
    </div>
  );
});
