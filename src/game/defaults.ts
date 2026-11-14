import {
  FINAL_QUESTION_COUNT,
  type Answer,
  type FinalQuestion,
  type FinalState,
  type GameState,
  type MultiplierSetting,
  type QuestionSet,
  type RoundQuestion,
  type RoundState,
  type Settings,
} from './types';

export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type AnswerSeed = [text: string, points: number];

function answers(seeds: AnswerSeed[]): Answer[] {
  return seeds.map(([text, points]) => ({ id: makeId(), text, points }));
}

export function newRoundQuestion(
  question = '',
  seeds: AnswerSeed[] = [],
  multiplier: MultiplierSetting = 'auto',
): RoundQuestion {
  return { id: makeId(), question, answers: answers(seeds), multiplier };
}

export function newFinalQuestion(question = '', seeds: AnswerSeed[] = []): FinalQuestion {
  return { id: makeId(), question, answers: answers(seeds) };
}

export function newAnswer(text = '', points = 0): Answer {
  return { id: makeId(), text, points };
}

export const DEFAULT_SETTINGS: Settings = {
  title: 'Sto Głosów',
  teamNames: ['Kowalscy', 'Nowakowie'],
  teamColors: ['#e8283c', '#2a5cff'],
  targetScore: 300,
  finalTarget: 200,
  finalTimers: [15, 20],
  showQuestionOnBoard: true,
  sound: 'board',
};

export function sampleQuestions(): QuestionSet {
  return {
    rounds: [
      newRoundQuestion('Wymień markę szkockiej whisky.', [
        ['Johnnie Walker', 31],
        ["Ballantine's", 24],
        ["Grant's", 15],
        ['Chivas Regal', 9],
        ['Jura', 7],
        ['Lagavulin', 5],
      ]),
      newRoundQuestion('Wymień postać z serialu „Czterej pancerni i pies”.', [
        ['Szarik', 33],
        ['Janek Kos', 24],
        ['Gustlik', 16],
        ['Grigorij', 11],
        ['Marusia', 6],
        ['Olgierd Jarosz', 4],
        ['Mirosław Juzenków', 1],
      ]),
      newRoundQuestion('Wymień film science fiction.', [
        ['Gwiezdne wojny', 32],
        ['Matrix', 17],
        ['Obcy', 12],
        ['Terminator', 10],
        ['Avatar', 8],
        ['Seksmisja', 6],
      ]),
      newRoundQuestion('Wymień film albo serial Stanisława Barei.', [
        ['Miś', 38],
        ['Alternatywy 4', 21],
        ['Zmiennicy', 12],
        ['Brunet wieczorową porą', 9],
        ['Poszukiwany, poszukiwana', 7],
        ['Nie ma róży bez ognia', 5],
      ], 2),
      newRoundQuestion('Więcej niż jedno zwierzę to...?', [
        ['Owca', 45],
        ['Lama', 35],
        ['Wataha', 15],
      ]),
      newRoundQuestion('Wymień coś, co zwykle jest w lodówce.', [
        ['Mleko', 30],
        ['Masło', 21],
        ['Jajka', 16],
        ['Ser', 12],
        ['Wędlina', 9],
      ]),
      newRoundQuestion('Z czym kojarzy ci się zima?', [
        ['Śnieg', 41],
        ['Mróz', 18],
        ['Święta', 15],
        ['Narty', 10],
        ['Sanki', 7],
        ['Bałwan', 5],
      ]),
      newRoundQuestion('Co robisz w niedzielę rano?', [
        ['Śpię', 38],
        ['Jem śniadanie', 22],
        ['Idę do kościoła', 17],
        ['Piję kawę', 9],
        ['Idę na spacer', 6],
      ]),
      newRoundQuestion('Wymień zwierzę, które można spotkać w polskim lesie.', [
        ['Sarna', 29],
        ['Dzik', 25],
        ['Lis', 17],
        ['Wiewiórka', 12],
        ['Jeleń', 9],
        ['Zając', 5],
      ]),
      newRoundQuestion('Co ludzie najczęściej gubią?', [
        ['Klucze', 45],
        ['Telefon', 19],
        ['Okulary', 12],
        ['Portfel', 10],
        ['Rękawiczki', 6],
        ['Długopis', 4],
      ]),
      newRoundQuestion('Wymień popularne polskie danie.', [
        ['Pierogi', 40],
        ['Schabowy', 20],
        ['Bigos', 14],
        ['Żurek', 10],
        ['Gołąbki', 8],
        ['Rosół', 5],
      ]),
    ],
    final: [
      newFinalQuestion('Co można spotkać podczas spaceru po lesie?', [
        ['Grzyby', 35],
        ['Sarnę', 25],
        ['Dzika', 12],
        ['Drzewa', 12],
        ['Wiewiórkę', 10],
      ]),
      newFinalQuestion('Co kierowca zawsze powinien mieć w samochodzie?', [
        ['Prawo jazdy', 32],
        ['Apteczkę', 24],
        ['Gaśnicę', 12],
        ['Trójkąt', 12],
        ['Koło zapasowe', 11],
      ]),
      newFinalQuestion('Co najczęściej uprawia się w przydomowym ogródku?', [
        ['Pomidory', 36],
        ['Ogórki', 22],
        ['Marchewkę', 17],
        ['Sałatę', 12],
        ['Rzodkiewkę', 8],
      ]),
      newFinalQuestion('Co ludzie najczęściej kupują przed seansem w kinie?', [
        ['Popcorn', 45],
        ['Napój', 25],
        ['Nachosy', 15],
        ['Bilet', 8],
        ['Cukierki', 5],
      ]),
      newFinalQuestion('Co solenizant chciałby dostać na urodziny?', [
        ['Święty spokój', 35],
        ['Pieniądze', 25],
        ['Niespodziankę', 15],
        ['Wycieczkę', 11],
        ['Alkohol', 10],
      ]),
    ],
  };
}

export function emptyRound(): RoundState {
  return {
    index: -1,
    questionId: null,
    multiplier: 1,
    phase: 'faceoff',
    control: null,
    revealed: {},
    bank: 0,
    strikes: [[], []],
    showQuestion: true,
    result: null,
  };
}

function emptyFinalEntries(): (null)[] {
  return Array.from({ length: FINAL_QUESTION_COUNT }, () => null);
}

export function emptyFinal(settings: Settings): FinalState {
  const durationMs = settings.finalTimers[0] * 1000;
  return {
    team: null,
    player: 1,
    entries: [emptyFinalEntries(), emptyFinalEntries()],
    hideFirst: false,
    timer: { durationMs, remainingMs: durationMs, startedAt: null },
  };
}

export function initialState(): GameState {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    teamNames: [...DEFAULT_SETTINGS.teamNames],
    teamColors: [...DEFAULT_SETTINGS.teamColors],
  };
  return {
    v: 1,
    settings,
    questions: sampleQuestions(),
    screen: 'title',
    scores: [0, 0],
    round: emptyRound(),
    final: emptyFinal(settings),
    winner: null,
    event: null,
  };
}
