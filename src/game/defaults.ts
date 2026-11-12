import {
  FINAL_QUESTION_COUNT,
  type Answer,
  type FinalQuestion,
  type FinalState,
  type GameState,
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

export function newRoundQuestion(question = '', seeds: AnswerSeed[] = []): RoundQuestion {
  return { id: makeId(), question, answers: answers(seeds), multiplier: 'auto' };
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
};

export function sampleQuestions(): QuestionSet {
  return {
    rounds: [
      newRoundQuestion('Co zabierasz ze sobą na plażę?', [
        ['Ręcznik', 34],
        ['Krem do opalania', 22],
        ['Okulary przeciwsłoneczne', 14],
        ['Parasol', 11],
        ['Książkę', 8],
        ['Picie', 6],
      ]),
      newRoundQuestion('Wymień coś, co zwykle jest w lodówce.', [
        ['Mleko', 30],
        ['Masło', 21],
        ['Jajka', 16],
        ['Ser', 12],
        ['Wędlina', 9],
        ['Piwo', 7],
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
      newFinalQuestion('Wymień czerwony owoc.', [
        ['Truskawka', 38],
        ['Jabłko', 24],
        ['Wiśnia', 15],
        ['Malina', 11],
        ['Czereśnia', 7],
      ]),
      newFinalQuestion('Ile godzin na dobę śpi przeciętny dorosły?', [
        ['8 godzin', 44],
        ['7 godzin', 23],
        ['6 godzin', 15],
        ['9 godzin', 8],
        ['10 godzin', 4],
      ]),
      newFinalQuestion('Wymień coś, co ma klawisze.', [
        ['Klawiatura', 40],
        ['Pianino', 31],
        ['Telefon', 12],
        ['Akordeon', 7],
        ['Pilot', 6],
      ]),
      newFinalQuestion('Dokąd Polacy jeżdżą na wakacje?', [
        ['Nad morze', 46],
        ['W góry', 25],
        ['Za granicę', 14],
        ['Nad jezioro', 8],
        ['Na wieś', 4],
      ]),
      newFinalQuestion('Wymień kolor, który często jest na flagach.', [
        ['Czerwony', 35],
        ['Biały', 30],
        ['Niebieski', 18],
        ['Zielony', 9],
        ['Żółty', 5],
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
