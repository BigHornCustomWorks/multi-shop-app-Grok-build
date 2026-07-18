import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function EditableList({ title, items, onChange, placeholder, disabled }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(items) ? items : [];

  const add = () => {
    if (!draft.trim() || disabled) return;
    onChange([...list, draft.trim()]);
    setDraft('');
  };

  return (
    <div className="app-card p-5">
      <h3 className="section-title mb-3">{title}</h3>
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
  );
}
