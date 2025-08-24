"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
  group?: string;
};

export type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  clearText?: string;
  searchPlaceholder?: string;
  groupsOrder?: string[];
  className?: string;
};

export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  emptyText = "No matches",
  clearText = "Clear all",
  searchPlaceholder = "Search...",
  groupsOrder,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            o.value.toLowerCase().includes(q) ||
            (o.group || "").toLowerCase().includes(q)
        )
      : options;
    const grouped: Record<string, MultiSelectOption[]> = {};
    for (const o of list) {
      const g = o.group || "Other";
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(o);
    }
    const order = groupsOrder || Object.keys(grouped);
    return order.map((g) => ({ group: g, items: grouped[g] || [] }));
  }, [options, query, groupsOrder]);

  const toggle = (val: string) => {
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
  };
  const clearAll = () => onChange([]);

  const toggleGroup = (group: string, items: MultiSelectOption[]) => {
    const vals = items.map((it) => it.value);
    const allSelected = vals.every((v) => value.includes(v));
    if (allSelected) {
      onChange(value.filter((v) => !vals.includes(v)));
    } else {
      const set = new Set(value);
      vals.forEach((v) => set.add(v));
      onChange(Array.from(set));
    }
  };

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      const t = e.target as Node;
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const selectedChips = value
    .map((v) => byValue.get(v))
    .filter(Boolean) as MultiSelectOption[];

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
        className="w-full min-h-[42px] rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between gap-2"
      >
        <span className="flex-1 flex flex-wrap gap-1 items-center">
          {selectedChips.length === 0 && (
            <span className="text-gray-500 text-sm">{placeholder}</span>
          )}
          {selectedChips.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-600 text-white"
            >
              {opt.label}
              <span
                role="button"
                aria-label={`Remove ${opt.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(opt.value);
                }}
                className="cursor-pointer opacity-90 hover:opacity-100"
              >
                ×
              </span>
            </span>
          ))}
        </span>
        <span className="shrink-0 text-xs text-gray-500">{value.length}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-xl overflow-hidden max-h-[60vh]"
          role="listbox"
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2.5 py-2 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={clearAll}
                className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-700"
              >
                {clearText}
              </button>
            </div>
          </div>

          <div className="max-h-[48vh] overflow-auto p-2">
            {filtered.length === 0 || filtered.every((f) => f.items.length === 0) ? (
              <div className="p-6 text-center text-sm text-gray-500">{emptyText}</div>
            ) : (
              filtered.map(({ group, items }) => (
                <div key={group} className="mb-3">
                  <div className="px-2 py-1.5 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{group}</div>
                    {items.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleGroup(group, items); }}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300"
                        aria-label={`Select all in ${group}`}
                      >
                        {(() => {
                          const vals = items.map((it) => it.value);
                          const count = vals.filter((v) => value.includes(v)).length;
                          const all = count === vals.length;
                          const none = count === 0;
                          return (
                            <span className="inline-flex items-center gap-1">
                              <span
                                aria-hidden
                                className={`inline-block h-3 w-3 rounded-sm border ${
                                  all
                                    ? 'bg-blue-600 border-blue-600'
                                    : none
                                    ? 'border-gray-300 dark:border-gray-700'
                                    : 'border-blue-400 bg-blue-200/60 dark:border-blue-500 dark:bg-blue-500/20'
                                }`}
                              />
                              <span>{all ? 'Clear' : 'Select all'}</span>
                            </span>
                          );
                        })()}
                      </button>
                    )}
                  </div>
                  <div className="h-px bg-gray-100 dark:bg-gray-800 mb-1" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-1">
                    {items.map((opt) => {
                      const active = value.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggle(opt.value)}
                          className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm border ${
                            active
                              ? "border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                              : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`inline-block h-4 w-4 rounded-sm border ${
                              active
                                ? "bg-blue-600 border-blue-600"
                                : "border-gray-300 dark:border-gray-700"
                            }`}
                          />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
