"use client";

type PlayerEmojiPickerProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onRefresh?: () => void;
  refreshAriaLabel?: string;
};

export function PlayerEmojiPicker({
  options,
  value,
  onChange,
  disabled = false,
  onRefresh,
  refreshAriaLabel = "Refresh options",
}: PlayerEmojiPickerProps) {
  return (
    <div className="picker-grid">
      {options.map((emoji) => {
        const selected = emoji === value;
        return (
          <button
            className={`picker-circle picker-emoji ${selected ? "picker-circle-selected picker-emoji-selected" : ""}`}
            disabled={disabled}
            key={emoji}
            onClick={() => onChange(emoji)}
            type="button"
          >
            {emoji}
          </button>
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
