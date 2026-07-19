import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Editable list of strings (locations, statuses, tech names, etc.).
 * Collapsible so Master Control / settings pages stay scannable on small screens.
 */
export default function EditableList({
  title,
  items,
  onChange,
  placeholder,
  disabled,
  /** When true, starts expanded. Default collapsed so lists don't fill the page. */
  defaultOpen = false,
}) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(defaultOpen);
  const list = Array.isArray(items) ? items : [];

  const add = () => {
    if (!draft.trim() || disabled) return;
    onChange([...list, draft.trim()]);
    setDraft('');
  };

  return (
    <div className="app-card p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <h3 className="section-title mb-0 flex items-center gap-2">
            {open ? (
              <ChevronDown size={16} className="shrink-0 text-slate-400" />
            ) : (
              <ChevronRight size={16} className="shrink-0 text-slate-400" />
            )}
            <span className="truncate">{title}</span>
          </h3>
          {!open && (
            <p className="text-[11px] text-slate-400 mt-1 ml-6">
              {list.length === 0
                ? 'No items — tap to edit'
                : `${list.length} item${list.length === 1 ? '' : 's'}: ${list.slice(0, 3).join(', ')}${
                    list.length > 3 ? '…' : ''
                  }`}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-slate-400 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
          {list.length}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-700/80">
          <div className="flex gap-2 mb-3 mt-3">
            <input
              className="field flex-1 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button
              type="button"
              onClick={add}
              disabled={disabled}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 rounded-xl font-bold text-sm disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {list.map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-100 dark:border-slate-700"
              >
                <span className="text-sm font-semibold">{item}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(list.filter((_, i) => i !== idx))}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {list.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No items yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
