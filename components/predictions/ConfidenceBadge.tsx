type ConfidenceBadgeProps = {
  confidence: number;
  variant?: 'gold' | 'green' | 'neutral';
};

export function ConfidenceBadge({ confidence, variant = 'neutral' }: ConfidenceBadgeProps) {
  const styles = {
    gold: 'border-amber-400/40 bg-amber-400/15 text-amber-300',
    green: 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300',
    neutral: 'border-zinc-700 bg-zinc-800/80 text-zinc-300',
  }[variant];

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>
      {Math.round(confidence)}% confidence
    </span>
  );
}
