export function resolveResult(
  pick: string,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
  status: string,
  locked: boolean,
): string {
  if (locked || pick.includes('🔒')) return '🔒 Locked';
  if (status !== 'finished') return '⏳ Pending';

  if (homeScore == null || awayScore == null) return '⏳ Pending';

  const normalizedPick = pick.trim().toUpperCase();
  let won: boolean | null = null;

  switch (normalizedPick) {
    case 'HOME':
      won = homeScore > awayScore;
      break;
    case 'DRAW':
      won = homeScore === awayScore;
      break;
    case 'AWAY':
      won = awayScore > homeScore;
      break;
    case 'GG YES':
      won = homeScore >= 1 && awayScore >= 1;
      break;
    case 'GG NO':
      won = homeScore === 0 || awayScore === 0;
      break;
    case 'OVER 2.5':
      won = homeScore + awayScore >= 3;
      break;
    case 'UNDER 2.5':
      won = homeScore + awayScore < 3;
      break;
    default:
      return '⏳ Pending';
  }

  return won ? '✅ WIN' : '❌ LOSS';
}
