type PlayerBoxProps = {
  name: string;
  color: string;
  emoji: string;
  className?: string;
};

export function PlayerBox({
  name,
  color,
  emoji,
  className,
}: PlayerBoxProps) {
  const displayName = name.trim() || "Your Name";
  const wrapperClass = className ? `player-box ${className}` : "player-box";

  return (
    <div className={wrapperClass}>
      <p className="player-box-value pb-2">
        <span style={{ color }} className="font-bold">
          {displayName}
        </span>
        <span className="player-box-emoji">{emoji}</span>
      </p>
    </div>
  );
}
