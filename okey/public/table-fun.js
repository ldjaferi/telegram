export const bujLines = [
  "Ihr sind alles Opfer und chömed i dhölll",
  "Ich gang uf sBoot. I nim keine mit",
  "dBrocki hät gad 50% Rabatt",
  "Ich chum grad. Muess nur no churz is Brocki.",
  "Für euch hät sBoot leider kei Platz.",
  "50 Prozent Rabatt. Ich han trotzdem verhandlet.",
  "Ich ha kei Joker. Ich ha Beziehige.",
  "Spieled wiiter. Ich lueg schnell uf Ricardo.",
  "Wer verlürt, zahlt sBenzin fürs Boot.",
  "Ihr chönd mit ufs Boot. Aber schwümme müend ihr sälber.",
  "Ich gib eine us. Aber mir teiled sGlas.",
  "De Çay isch gratis. S’heisse Wasser choschtet.",
  "Ich bi nöd geizig. Ihr sind eifach z’tüür.",
  "Chömed ruhig verbii. Ich bi denn nöd dihei.",
  "Ich gönn eu alles. Solang ich’s nöd zahle.",
  "dBrocki hät 50 Prozent. Ich frag, öb no öppis gaht.",
  "Ich ha eu öppis mitbracht. D’Quittig, zum Teile.",
  "Ihr sind mini beschte Fründe. Aber fasst mini Snacks nöd aa.",
  "Ich lade eu zum Znacht ii. Ässed vorher no öppis.",
  "Wer gwünnt, zahlt de Çay. Ich verlür us Prinzip.",
  "Ich vermiss eu scho. Aber bliibed no chli det."
];

export function canMakeExcuse(room, seat) {
  if (!room || room.status !== 'finished' || seat < 0 || seat >= room.players.length) return false;
  const side = room.mode === 'teams' ? seat % 2 : seat;
  if (room.matchComplete) return room.matchWinners.length > 0 && !room.matchWinners.includes(side);
  const winner = room.scores.at(-1)?.winner;
  return Number.isInteger(winner) && winner >= 0 && winner !== side;
}

export function excuseLines(mode) {
  return [
    'Ich habe euch gewinnen lassen.',
    'Das WLAN war gegen mich.',
    'Ich war noch beim Aufwärmen.',
    ...(mode === 'teams' ? ['Mein Teampartner war das Problem.'] : [])
  ];
}

export function teaBill(room) {
  if (!room || room.status !== 'finished' || !room.scores.length) return null;
  const score = room.scores.at(-1), points = room.matchComplete ? room.totals : score.points;
  const highest = Math.max(...points);
  const names = score.names || room.players.map(p => p.name);
  const payers = highest > 0 ? points.flatMap((value, side) => value !== highest ? [] : [{
    label: room.mode === 'teams' ? `Team ${side === 0 ? 'A' : 'B'}` : names[side],
    names: names.filter((_, seat) => (room.mode === 'teams' ? seat % 2 : seat) === side),
    points: value
  }]) : [];
  return { scope: room.matchComplete ? 'Ganze Partie' : `Runde ${room.round}`, payers,
    caption: !payers.length ? 'Der Çay geht aufs Haus.' : payers.length > 1 ? 'Die Çay-Rechnung wird geteilt.' : `${payers[0].label} zahlt den Çay.` };
}
