function resolveResult(pick, homeScore, awayScore, status, locked = false) {
  if (locked) return '🔒 Locked';
  if (status !== 'finished') return '⏳ Pending';
  if (homeScore == null || awayScore == null) return '⏳ Pending';

  const total = homeScore + awayScore;

  switch (String(pick).toUpperCase()) {
    case 'HOME':
      return homeScore > awayScore ? '✅ WIN' : '❌ LOSS';
    case 'DRAW':
      return homeScore === awayScore ? '✅ WIN' : '❌ LOSS';
    case 'AWAY':
      return awayScore > homeScore ? '✅ WIN' : '❌ LOSS';
    case 'GG YES':
      return homeScore > 0 && awayScore > 0 ? '✅ WIN' : '❌ LOSS';
    case 'OVER 2.5':
      return total >= 3 ? '✅ WIN' : '❌ LOSS';
    case 'UNDER 2.5':
      return total < 3 ? '✅ WIN' : '❌ LOSS';
    default:
      return '⏳ Pending';
  }
}
