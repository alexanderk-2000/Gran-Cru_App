import React from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Shared page heading: small section label, serif title, one-line description,
 * actions aligned right (wrapping below on narrow screens).
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, actions }) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <div className="flex flex-col gap-1.5 min-w-0">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-gray">{eyebrow}</p>
      )}
      <h1 className="font-serif text-3xl md:text-[40px] font-semibold leading-tight text-charcoal">{title}</h1>
      {description && <p className="text-charcoal-soft">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>
);

/** Shared button styles so every page uses the same primary/secondary look. */
export const buttonClass = {
  primary:
    'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] bg-burgundy text-white font-semibold text-sm hover:bg-burgundy-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] border border-line-strong bg-white text-charcoal font-semibold text-sm hover:bg-alabaster transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'inline-flex items-center justify-center gap-2 h-10 px-3 rounded-lg text-burgundy font-semibold text-sm hover:bg-burgundy-tint transition-colors disabled:opacity-50'
};

/** Card surface used across pages. */
export const cardClass = 'bg-white border border-line rounded-[14px]';
