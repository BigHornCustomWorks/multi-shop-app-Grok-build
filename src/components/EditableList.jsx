import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';

/**
 * Editable list of strings (locations, statuses, tech names, etc.).
 * Collapsible; drag handle next to delete to reorder (dropdown order = list order).
 */
export default function EditableList({
  title,
  items,
  onChange,
  placeholder,
  disabled,
  /** When true, starts expanded. Default collapsed so lists don't fill the page. */
  defaultOpen = false,
  /** Hint under the list when open */
  hint,
}) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(defaultOpen);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const list = Array.isArray(items) ? items : [];

  const add = () => {
    if (!draft.trim() || disabled) return;
    onChange([...list, draft.trim()]);
    setDraft('');
  };

  const moveItem = (from, to) => {
    if (from === to || from == null || to == null) return;
    if (from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const onDragStart = (e, idx) => {
    if (disabled) return;
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    // Firefox needs data set
    try {
      e.dataTransfer.setData('application/x-index', String(idx));
    } catch {
      /* ignore */
    }
  };

  const onDragOver = (e, idx) => {
    if (disabled || dragIndex == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== idx) setOverIndex(idx);
  };

  const onDrop = (e, idx) => {
    e.preventDefault();
    if (disabled) return;
    let from = dragIndex;
    if (from == null) {
      const raw = e.dataTransfer.getData('text/plain');
      from = raw !== '' ? Number(raw) : null;
    }
    moveItem(from, idx);
    setDragIndex(null);
    setOverIndex(null);
  };

  const onDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
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
          <p className="text-[10px] text-slate-400 mt-2 mb-2 leading-relaxed">
            {hint ||
              'Drag ⋮⋮ next to delete to change order — top of list appears first in dropdowns.'}
          </p>
          <div className="flex gap-2 mb-3">
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
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {list.map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                draggable={!disabled}
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={(e) => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                className={`flex justify-between items-center gap-2 p-2.5 sm:p-3 rounded-xl border transition-colors ${
                  dragIndex === idx
                    ? 'opacity-50 border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : overIndex === idx && dragIndex != null
                      ? 'border-blue-400 bg-blue-50/80 dark:bg-blue-950/40 ring-1 ring-blue-300'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-100 dark:border-slate-700'
                } ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
              >
                <span className="text-sm font-semibold min-w-0 flex-1 break-words">{item}</span>
                {!disabled && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        onDragStart(e, idx);
                      }}
                      onClick={(e) => e.preventDefault()}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700 cursor-grab active:cursor-grabbing touch-none"
                      title="Drag to reorder"
                      aria-label={`Drag to reorder ${item}`}
                    >
                      <GripVertical size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(list.filter((_, i) => i !== idx))}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      title="Delete"
                      aria-label={`Delete ${item}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
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
