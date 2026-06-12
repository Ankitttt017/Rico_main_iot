import React, { useEffect, useMemo, useRef, useState } from "react";
import { sortBySearchRelevance } from "../../utils/searchRelevance";

const defaultInputClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm font-medium text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-50";

const normalize = (value) => String(value || "").trim().toLowerCase();

const SearchableSelect = ({
  value,
  onChange,
  options = [],
  placeholder = "Select",
  inputClassName = defaultInputClass,
  disabled = false,
  allowCustom = false,
  maxVisible = 80,
}) => {
  const wrapperRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((option) => String(option.value) === String(value)),
    [options, value]
  );

  useEffect(() => {
    if (!open) setQuery(selected?.label || (allowCustom ? value || "" : ""));
  }, [allowCustom, open, selected?.label, value]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const visibleOptions = useMemo(() => {
    const term = normalize(query);
    const selectedLabel = normalize(selected?.label);
    const shouldFilter = term && term !== selectedLabel;
    const rows = shouldFilter
      ? sortBySearchRelevance(options.filter((option) => {
          const haystack = normalize(
            `${option.label} ${option.value} ${option.keywords || ""}`
          );
          return haystack.includes(term);
        }), term, (option) => [option.label, option.value, option.keywords, option.description])
      : options;
    return rows.slice(0, maxVisible);
  }, [maxVisible, options, query]);

  const chooseOption = (option) => {
    onChange(option.value, option);
    setQuery(option.label);
    setOpen(false);
  };

  const handleInputChange = (event) => {
    const nextValue = event.target.value;
    setQuery(nextValue);
    setOpen(true);
    if (allowCustom) onChange(nextValue);
    if (!allowCustom && nextValue === "") onChange("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && open && visibleOptions.length) {
      event.preventDefault();
      chooseOption(visibleOptions[0]);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={handleInputChange}
        onFocus={() => {
          if (!allowCustom) setQuery("");
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!allowCustom) setQuery("");
          setOpen((current) => !current);
        }}
        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:pointer-events-none"
        title="Open options"
      >
        <svg className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/80">
          {visibleOptions.length ? (
            visibleOptions.map((option) => (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseOption(option)}
                className={`flex w-full flex-col px-3 py-2 text-left transition hover:bg-teal-50 ${
                  String(option.value) === String(value) ? "bg-teal-50 text-teal-800" : "text-slate-700"
                }`}
              >
                <span className="truncate text-sm font-bold">{option.label}</span>
                {option.description && (
                  <span className="truncate text-xs font-medium text-slate-400">{option.description}</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm font-semibold text-slate-400">No options found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
