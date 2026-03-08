"use client";

type PlayerColorPickerProps = {
  options: string[];
  value: string;
  unavailableOptions?: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  onRefresh?: () => void;
  refreshAriaLabel?: string;
};

export function PlayerColorPicker({
  options,
  value,
  unavailableOptions = [],
  onChange,
  disabled = false,
  onRefresh,
  refreshAriaLabel = "Refresh options",
}: PlayerColorPickerProps) {
  const unavailableSet = new Set(unavailableOptions.map((color) => color.toLowerCase()));

  return (
    <div className="picker-grid">
      {options.map((color) => {
        const selected = color === value;
        const unavailable = unavailableSet.has(color.toLowerCase()) && !selected;
        return (
          <button
            aria-label={color}
            className={`picker-circle ${selected ? "picker-circle-selected" : ""} ${
              unavailable ? "picker-circle-muted" : ""
            }`}
            disabled={disabled || unavailable}
            key={color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            type="button"
          />
        );
      })}
      <button
        aria-label={refreshAriaLabel}
        className="picker-circle picker-refresh"
        disabled={disabled || !onRefresh}
        onClick={onRefresh}
        type="button"
      >
        <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path
            d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>
    </div>
  );
}
