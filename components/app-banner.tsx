"use client";

type AppBannerActionIcon = "home" | "info";

type AppBannerAction = {
  label: string;
  icon: AppBannerActionIcon;
  onClick: () => void;
};

type AppBannerProps = {
  label?: string;
  className?: string;
  leftAction?: AppBannerAction;
  rightAction?: AppBannerAction;
};

function BannerIcon({ icon }: { icon: AppBannerActionIcon }) {
  if (icon === "home") {
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
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.25 9.75V21h13.5V9.75" />
        <path d="M9.75 21v-6h4.5v6" />
      </svg>
    );
  }

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

function BannerActionButton({
  action,
}: {
  action?: AppBannerAction;
}) {
  if (!action) {
    return <span aria-hidden="true" className="block h-7 w-7" />;
  }

  return (
    <button
      aria-label={action.label}
      className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/8 text-white/70 transition hover:bg-white/12 hover:text-white/90"
      onClick={action.onClick}
      title={action.label}
      type="button"
    >
      <BannerIcon icon={action.icon} />
    </button>
  );
}

export function AppBanner({
  label = "Who's Done It",
  className,
  leftAction,
  rightAction,
}: AppBannerProps) {
  const bannerClass = className ? `app-page-banner ${className}` : "app-page-banner";
  const hasActions = Boolean(leftAction || rightAction);

  return (
    <div className={bannerClass}>
      {hasActions ? (
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-stretch">
          <div className="flex items-center justify-center border-r border-white/20">
            <BannerActionButton action={leftAction} />
          </div>
          <div className="flex min-w-0 items-center justify-center px-2 text-center text-[0.92rem] tracking-[0.05em] sm:text-[1rem]">
            <div className="truncate">{label}</div>
          </div>
          <div className="flex items-center justify-center border-l border-white/20">
            <BannerActionButton action={rightAction} />
          </div>
        </div>
      ) : (
        <div className="text-center text-[0.92rem] tracking-[0.05em] sm:text-[1rem]">
          {label}
        </div>
      )}
    </div>
  );
}
