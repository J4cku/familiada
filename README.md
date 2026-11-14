# Sto Głosów

A Polish survey game-show for home parties: two teams, hidden top answers from a survey of 100
people, strikes, steals, round multipliers and a two-player final. Two views:

| View | URL | Where |
| --- | --- | --- |
| Host panel (prowadzący) | `/` | tablet or laptop |
| Board (tablica) | `/#/tablica/<KOD>` | laptop wired to the TV, fullscreen |

## Two devices (tablet + laptop at the TV)

The host panel shows a 5-character **game code** (in the header, and under *Ustawienia → Tablica
na innym urządzeniu*). On the laptop open `https://<your-app>/#/tablica`, type the code, click
the board once (browsers need one click before they play sound) and press **F** for fullscreen.
Sound plays on the board by default; switch it in the panel header.

The host pushes every change to a small Vercel Function (`api/room.ts`); the board polls it about
3× a second, and the final's countdown follows the server clock so both screens agree. A board
in the same browser as the host also syncs instantly through `BroadcastChannel`.

### Vercel setup (once)

The function keeps the current game in Redis:

1. Vercel dashboard → your project → **Storage** → add **Upstash for Redis** (the free tier is
   plenty) and connect it to the project. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` work too).
2. **Redeploy**, so the function picks up the new environment variables.

Until then the panel shows "Serwer działa, ale nie ma bazy" next to the code and only the
one-device setup works. Games expire from Redis after 2 days.

## Run locally

```sh
nvm use            # Node ≥ 22.12 (Vite 8)
npm install
npm run dev        # http://localhost:5173 — the dev server also serves /api/room (in memory)
npm test           # game-rule unit tests
npm run build      # static build in dist/
```

To try two devices on your network: `npm run dev -- --host`, then open the printed network
address on both devices.

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

- `api/room.ts` — Vercel Function for cross-device sync (Upstash Redis; in-memory in dev)
- `src/game/` — rules (`reducer.ts`, pure and unit-tested), types, selectors, sync store (`store.ts`, `remote.ts`), synthesized sounds
- `src/board/` — the TV board (canvas LED dot-matrix panels, code entry)
- `src/host/` — host panel: game control, final, question editor, settings
