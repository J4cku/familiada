# Sto Głosów

A Polish survey game-show for home parties: two teams, hidden top answers from a survey of 100
people, strikes, steals, round multipliers and a two-player final. Two views:

| View | URL | Where |
| --- | --- | --- |
| Host panel (prowadzący) | `http://localhost:5173/` | laptop |
| Board (tablica) | `http://localhost:5173/#/tablica` | TV / projector, fullscreen |

The views sync through `BroadcastChannel` + `localStorage`, so both must run in the same browser
on the same machine (laptop + TV as an extended display). No server or internet needed.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # game-rule unit tests
npm run build      # static build in dist/ — host it anywhere
```

In the host panel click **Otwórz tablicę**, drag the window to the TV and press **F**
(or *Pełny ekran*). Sounds play from the host window.

## Rules implemented

- **Pojedynek** (face-off): both teams may score into the bank; the host gives control to a team.
- The team in control keeps answering; **3 mistakes** hand the round to the other team for a
  single **przejęcie** (steal). A correct steal takes the whole bank, a miss gives it back.
- **Multipliers**: rounds 1–2 ×1, round 3 ×2, round 4+ ×3 (override per question in the editor).
- First team to **300** points wins (configurable); otherwise *Zakończ grę* picks the leader.
- **Finał**: 5 questions, player 1 has 15 s, player 2 has 20 s and cannot repeat player 1's
  answers; **200** points together wins (all values configurable).
- Every game action can be undone (**Cofnij**, Ctrl/Cmd+Z). Question and settings edits are never undone.

## Host shortcuts (Gra tab)

`1`–`8` reveal answer · `Q` / `P` face-off miss for left / right team · `X` miss · `Ctrl/Cmd+Z` undo

## Questions

Edit in the **Pytania** tab, or export/import a JSON file:

```json
{
  "rounds": [
    {
      "question": "Co zabierasz ze sobą na plażę?",
      "multiplier": "auto",
      "answers": [{ "text": "Ręcznik", "points": 34 }, { "text": "Krem do opalania", "points": 22 }]
    }
  ],
  "final": [
    { "question": "Wymień czerwony owoc.", "answers": [{ "text": "Truskawka", "points": 38 }] }
  ]
}
```

`final` must contain exactly 5 questions; each question can have up to 8 answers. `multiplier`
is `"auto"`, `1`, `2` or `3`.

## Code map

- `src/game/` — rules (`reducer.ts`, pure and unit-tested), types, selectors, sync store, synthesized sounds
- `src/board/` — the TV board (split-flap display)
- `src/host/` — host panel: game control, final, question editor, settings
