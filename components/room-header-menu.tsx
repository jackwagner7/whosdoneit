"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditIcon } from "@/components/edit-icon";
import { SettingsIcon } from "@/components/settings-icon";

type RoomHeaderMenuProps = {
  roomCode: string;
  codeCopied: boolean;
  onCopyRoomLink: () => void | Promise<void>;
  onOpenProfile: () => void;
  onOpenInfo: () => void;
  onOpenSettings?: () => void;
  settingsDisabled?: boolean;
  settingsHint?: string;
};

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16" />
      <path d="M7 12h13" />
      <path d="M10 17h10" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v5" />
      <path d="M12 7h.01" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="13" rx="2" width="13" x="8" y="8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

type MenuRowProps = {
  label: string;
  hint?: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

function MenuRow({ label, hint, icon, disabled = false, onClick }: MenuRowProps) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-950">{label}</span>
        {hint ? <span className="block text-[0.72rem] text-slate-500">{hint}</span> : null}
      </span>
    </button>
  );
}

export function RoomHeaderMenu({
  roomCode,
  codeCopied,
  onCopyRoomLink,
  onOpenProfile,
  onOpenInfo,
  onOpenSettings,
  settingsDisabled = false,
  settingsHint,
}: RoomHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function runAndClose(action: () => void | Promise<void>) {
    setOpen(false);
    void action();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Room menu"
        className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/8 text-white/70 transition hover:bg-white/12 hover:text-white/90"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <MenuIcon />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 text-slate-950 shadow-lg">
          <MenuRow
            hint={codeCopied ? "Room link copied" : "Tap to copy room link"}
            icon={<CopyIcon />}
            label={`Room Code ${roomCode}`}
            onClick={() => runAndClose(onCopyRoomLink)}
          />
          {onOpenSettings ? (
            <MenuRow
              disabled={settingsDisabled}
              hint={settingsHint}
              icon={<SettingsIcon />}
              label="Settings"
              onClick={() => runAndClose(onOpenSettings)}
            />
          ) : null}
          <MenuRow
            hint="Edit your name, colour, and emoji"
            icon={<EditIcon />}
            label="Edit Profile"
            onClick={() => runAndClose(onOpenProfile)}
          />
          <MenuRow
            hint="How to play"
            icon={<InfoIcon />}
            label="Game Info"
            onClick={() => runAndClose(onOpenInfo)}
          />
        </div>
      ) : null}
    </div>
  );
}
