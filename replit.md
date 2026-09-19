# BolForm

BolForm helps a person complete an English form by speaking naturally in Hindi or English, reviewing validated answers, correcting mistakes, and downloading a PDF.

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

## Product boundaries

- Supported: PDF, PNG, JPEG, and pasted text; up to 10 MB and 25 fields. The UI advertises the three-page prototype boundary.
- Tested languages: Hindi and English. Values retain the form's requested language where practical.
- Out of scope: signatures, attachments, CAPTCHAs, payments, arbitrary websites, submission, and institutional acceptance.
- A formatted response sheet is not represented as preserving an original scan's layout.

## Reliability rules

- Never silently switch away from Sarvam or fake model/voice results.
- Validate model patches against known field IDs and server-owned field rules before changing state.
- One active turn at a time; stale responses are discarded client-side.
- Failed upstream turns preserve the previous accepted values.
- Do not log transcripts, form answers, uploaded bytes, or secrets.
- Restart the API and web artifact workflows after server or frontend changes before preview verification.

## Repo map

- `artifacts/bolform/src/pages/Home.tsx` — complete product flow and in-memory session state
- `artifacts/bolform/src/hooks/` — microphone and raw upload/transcription/export clients
- `artifacts/api-server/src/lib/bolform.ts` — Sarvam clients, validation, examples, and PDF generation
- `artifacts/api-server/src/routes/bolform.ts` — bounded public API and short-lived file scoping
- `lib/api-spec/openapi.yaml` — typed contract
- `DEMO.md` — demonstration, test evidence, support matrix, and publishing steps