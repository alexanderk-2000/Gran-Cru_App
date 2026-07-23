import { memo } from 'react';
import type { SourceLink } from '../wineDetailSelectors.ts';

export const SourceFooter = memo(function SourceFooter({ sources }: { sources: SourceLink[] }) {
  if (sources.length === 0) return null;

  return (
    <footer className="mx-auto mt-10 max-w-6xl border-t border-stone-200 px-6 pt-8">
      <h4 className="mb-4 text-xs uppercase tracking-[0.18em] text-stone-500">Quellen</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:border-stone-300"
          >
            <p className="line-clamp-2 text-sm text-stone-800">{source.title}</p>
            <p className="mt-1 text-xs text-stone-500">{source.domain}</p>
          </a>
        ))}
      </div>
    </footer>
  );
});
