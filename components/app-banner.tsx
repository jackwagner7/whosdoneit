type AppBannerProps = {
  label?: string;
  className?: string;
};

export function AppBanner({
  label = "Who's Done It",
  className,
}: AppBannerProps) {
  const bannerClass = className ? `app-page-banner ${className}` : "app-page-banner";
  return <div className={bannerClass}>{label}</div>;
}
