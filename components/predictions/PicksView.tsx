import { AllPicksTable } from '@/components/predictions/AllPicksTable';
import { BankersGrid } from '@/components/predictions/BankersGrid';
import { BetOfTheDay } from '@/components/predictions/BetOfTheDay';
import type { SplitPredictions } from '@/lib/predictions';

type PicksViewProps = SplitPredictions;

export function PicksView({ betOfTheDay, bankers, allPicks }: PicksViewProps) {
  return (
    <div className="space-y-10">
      {betOfTheDay ? <BetOfTheDay prediction={betOfTheDay} /> : null}
      <BankersGrid bankers={bankers} />
      <AllPicksTable picks={allPicks} />
    </div>
  );
}
