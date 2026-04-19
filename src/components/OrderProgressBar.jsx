export default function OrderProgressBar({
  completionPercent = 0,
  status = 'pending',
  pieceCounts = null,
}) {
  const barColor =
    status === 'completed'
      ? 'bg-green-500'
      : status === 'in_progress'
        ? 'bg-blue-500'
        : 'bg-gray-400';

  const textColor =
    status === 'completed'
      ? 'text-green-700'
      : status === 'in_progress'
        ? 'text-blue-700'
        : 'text-gray-500';

  const percent = Math.min(100, Math.max(0, completionPercent));

  return (
    <div className="space-y-1">
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className={textColor}>
          {pieceCounts
            ? `${pieceCounts.completed} / ${pieceCounts.total} pieces`
            : `${percent}%`}
        </span>
        <span className={`font-medium ${textColor}`}>{percent}%</span>
      </div>
    </div>
  );
}
