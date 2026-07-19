import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Large rounded-rectangle select for dashboard status / location chips.
 * Use className="w-full" + parent grid for side-by-side mobile layout.
 */
export default function PillSelect({
  value,
  onChange,
  options = [],
  className = '',
  style,
  title,
  emptyLabel,
}) {
  const list = [...options];
  if (value && !list.includes(value)) list.unshift(value);

  return (
    <div className={`relative inline-flex min-w-0 ${className.includes('w-full') ? 'w-full' : 'max-w-full'}`} title={title}>
      <select
        value={value || ''}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onChange?.(e.target.value);
        }}
        style={style}
        className={`pill-select appearance-none cursor-pointer w-full pr-7 pl-2 py-2.5 sm:py-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-tight rounded-xl border-2 outline-none shadow-sm transition-all duration-150 hover:brightness-[0.98] active:scale-[0.99] focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 dark:focus:ring-blue-500 dark:focus:ring-offset-slate-900 truncate ${className}`}
      >
        {emptyLabel != null && <option value="">{emptyLabel}</option>}
        {list.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60 text-slate-800"
        aria-hidden
      />
    </div>
  );
}
