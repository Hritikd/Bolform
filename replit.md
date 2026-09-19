# BolForm

BolForm makes forms easier: upload a form, answer naturally in any of 11 Indian languages, review the filled details, and download a PDF. `README.md` is the public GitHub-facing guide; keep it in sync with product changes.

## Run & verify

- `pnpm --filter @workspace/api-server run dev` — API server (managed workflow, `/api`)
- `pnpm --filter @workspace/bolform run dev` — web app (managed workflow, `/`)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas after editing OpenAPI
- `pnpm run typecheck` — full workspace typecheck
- `pnpm run build` — typecheck and build all packages
- Required secret: `SARVAM_API_KEY` — server only; never expose it in browser code or logs

## Architecture

- React/Vite frontend in `artifacts/bolform`; Express API in `artifacts/api-server`.
- `lib/api-spec/openapi.yaml` is the source of truth for typed JSON endpoints.
- Sarvam powers chat/schema extraction, Bulbul v3 TTS, Saaras v3 STT, and asynchronous Document AI.
- Uploaded files and answers are held only in browser memory or a short-lived in-process server map. There is no user database or analytics.
- Native AcroForm PDFs are inspected locally and preserve binding names. Other documents produce an honestly labelled response sheet.
- The active session is an automatic listen → transcribe → process → speak loop. Voice activity detection ends a turn after speech followed by silence; typing remains a fallback.
- The guided one-answer path is latency-sensitive: use live browser transcription when available, deterministic single-field processing, and streamed speech playback. Sarvam batch transcription and model reasoning are compatibility paths.
- Language defaults to Auto: detect the spoken language per turn (11 Indian languages), keep a manual override available, and ask a specific field question on every turn.

## Product boundaries

- Supported: PDF, PNG, JPEG, and pasted text; up to 10 MB and 25 fields. The UI advertises the three-page prototype boundary.
- Speaking/screen languages: 11 (see Languages below). Values are written in the form's own language/script.
- Out of scope: signatures, attachments, CAPTCHAs, payments, arbitrary websites, submission, and institutional acceptance.
- A formatted response sheet is not represented as preserving an original scan's layout.

## Reliability rules

- Never silently switch away from Sarvam or fake model/voice results.
- Validate model patches against known field IDs and server-owned field rules before changing state.
- One active turn at a time; stale responses are discarded client-side.
- Never record while synthesized assistant audio is playing; pausing invalidates any in-flight turn.
- Failed upstream turns preserve the previous accepted values.
- Do not log transcripts, form answers, uploaded bytes, or secrets.
- Restart the API and web artifact workflows after server or frontend changes before preview verification.

## Repo map

- `README.md` — public project guide (GitHub); `LICENSE` — MIT
- `artifacts/api-server/assets/fonts/` — Noto fonts embedded in exported PDFs (Indic scripts); `regenerator-runtime` import is required by @pdf-lib/fontkit for Devanagari

- `artifacts/bolform/src/pages/Home.tsx` — complete product flow and in-memory session state
- `artifacts/bolform/src/hooks/` — microphone and raw upload/transcription/export clients
- `artifacts/api-server/src/lib/bolform.ts` — Sarvam clients, validation, examples, and PDF generation
- `artifacts/api-server/src/routes/bolform.ts` — bounded public API and short-lived file scoping
- `lib/api-spec/openapi.yaml` — typed contract
- `DEMO.md` — demonstration, test evidence, support matrix, and publishing steps
## Languages (Sept 2026)
- Speaking languages: 11 Sarvam languages (en, hi, bn, gu, kn, ml, mr, od, pa, ta, te `-IN`), shared `LanguageCode` enum in `lib/api-spec/openapi.yaml`. Auto mode = per-turn Sarvam STT auto-detect; fixed language = live browser transcription.
- Screen language is a separate picker. hi/en strings are static in `Home.tsx`; other languages are fetched via `POST /api/bolform/localize` (server-cached Sarvam translate, English fallback).
- Form values are converted to the form's `sourceLanguage` script server-side (`toFormLanguage` in `artifacts/api-server/src/lib/bolform.ts`): proper-noun fields transliterated, other text translated.
- Chat model is `sarvam-105b-conversations` (non-reasoning). Do not switch back to `sarvam-105b` for turns: it exhausts token budgets in reasoning.
