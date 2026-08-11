function resolveResult(pick, homeScore, awayScore, status, locked) {
  if (locked || String(pick).includes('🔒')) return '🔒 Locked';
  if (status !== 'finished') return '⏳ Pending';
  if (homeScore == null || awayScore == null) return '⏳ Pending';

  const normalizedPick = String(pick).trim().toUpperCase();
  let won = null;

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
