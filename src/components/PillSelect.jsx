import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Large pill-shaped select for dashboard status / location chips.
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
    <div className="relative inline-flex max-w-full" title={title}>
      <select
        value={value || ''}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onChange?.(e.target.value);
        }}
        style={style}
        className={`pill-select appearance-none cursor-pointer pr-8 pl-3.5 py-2 text-[11px] sm:text-xs font-bold rounded-full border-2 outline-none shadow-sm transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 dark:focus:ring-blue-500 dark:focus:ring-offset-slate-900 max-w-[12.5rem] truncate ${className}`}
      >
        {emptyLabel != null && <option value="">{emptyLabel}</option>}
        {list.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60 text-slate-800"
        aria-hidden
      />
    </div>
  );
}
