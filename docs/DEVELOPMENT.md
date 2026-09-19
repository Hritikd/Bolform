# Developer guide

[← Back to BolForm](../README.md) · [Demo walkthrough](../DEMO.md) · [Build story](BUILD_STORY.md)

## Setup

Use **Node.js 24**, **pnpm 10**, and a **Linux x64** environment such as Replit. The overrides in `pnpm-workspace.yaml` exclude native packages for other platforms; the checked-in setup is not a native macOS or Windows installation recipe.

```bash
git clone https://github.com/Hritikd/Bolform.git
cd Bolform
pnpm install --frozen-lockfile
export SARVAM_API_KEY='your_key_here'
PORT=8080 pnpm --filter @workspace/api-server run dev
```

In a second terminal, from the repository root:

```bash
PORT=5173 BASE_PATH=/ API_PROXY_TARGET=http://localhost:8080 pnpm --filter @workspace/bolform run dev
```

Open [localhost:5173](http://localhost:5173) and select **Try Sample**. Keep the Sarvam key on the API server; never put it in client code. These commands use shell environment variables and do not require a `.env` file.

## Configuration

| Variable | Service | Purpose |
| --- | --- | --- |
| `SARVAM_API_KEY` | API | Required for Sarvam speech, conversation, language conversion, and document extraction. |
| `PORT` | Both | Each service requires its own port. |
| `BASE_PATH` | Web | Required; use `/` at the site root. |
| `API_PROXY_TARGET` | Web, development | Forwards `/api` to the API server when running outside Replit. |
| `SARVAM_CHAT_MODEL` | API | Optional; defaults to `sarvam-105b-conversations`. |
| `LOG_LEVEL` | API | Optional pino logging level. |

On Replit, use secrets for the API key and the platform's service routing for `/api`.

## Architecture

| Stage | Implementation | Why it matters |
| --- | --- | --- |
| Read the form | `pdf-lib` inspects native PDF fields; Sarvam Document AI handles other documents; the chat model structures pasted text. | The same conversation flow can use different forms. |
| Capture an answer | Auto mode uses Sarvam Saaras v3 transcription. A fixed language can use browser speech recognition where available. | People can switch languages or select a fixed one. |
| Apply the answer | Short answers take a deterministic path; sentences and corrections use `sarvam-105b-conversations`. | Simple answers avoid an unnecessary conversation-model request. |
| Validate and convert | Server checks known fields, select options, phone length, and email shape; translation/transliteration aligns values with the form language. | Model output is checked before it changes accepted answers. |
| Ask the next question | Required-field state selects the next question; translations are cached and Bulbul v3 audio is streamed. | The flow stays focused on one missing detail. |
| Export | Supported uploaded AcroForm text fields are filled in place; other paths generate a labelled response sheet with Indic font support. | The output distinguishes the original document from a generated sheet. |

Screen language and speaking language are independent. Hindi and English UI strings live in `Home.tsx`; the other nine translations are bundled in `ui-strings.json` with an English fallback. Spoken prompts can use server-side localization.

## Repository map

```text
artifacts/
  bolform/                    React + Vite application
    src/pages/Home.tsx        Setup, conversation, review, session state
    src/hooks/                Recording and API clients
    src/lib/ui-strings.json   Bundled interface translations
  api-server/                 Express API
    src/routes/bolform.ts     Endpoints, upload limits, original-PDF map
    src/lib/bolform.ts        Sarvam calls, validation, examples, PDF export
    assets/fonts/            Noto fonts for response sheets
lib/
  api-spec/openapi.yaml       Typed JSON API contract
  api-client-react/           Generated React Query hooks
  api-zod/                    Generated request/response schemas
DEMO.md                       Walkthrough and recorded verification
replit.md                     Engineering context and reliability rules
```

The workspace also retains scaffolding such as `lib/db` and `artifacts/mockup-sandbox`; the BolForm product flow uses the web and API packages above and does not require a user database.

## API reference

Base path: `/api/bolform`. See the [OpenAPI contract](../lib/api-spec/openapi.yaml) for typed JSON payloads and the [route source](../artifacts/api-server/src/routes/bolform.ts) for raw upload and export endpoints.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/status` | Reports whether a Sarvam key is configured; does not test provider availability. |
| `GET` | `/examples` | Lists fictional sample schemas. |
| `GET` | `/examples/:id/pdf` | Generates a blank sample PDF. |
| `POST` | `/import` | Reads a PDF, PNG, or JPEG into a field schema. |
| `POST` | `/parse-text` | Extracts a schema from pasted questions. |
| `POST` | `/turn` | Applies an answer and returns field patches and the next question. |
| `POST` | `/transcribe` | Transcribes audio; accepts `X-Language: auto` or a supported code. |
| `GET` | `/speak-stream` | Streams spoken prompt audio. |
| `POST` | `/speak` | Generates non-streamed speech. |
| `POST` | `/localize` | Translates up to 80 strings, each up to 300 characters. |
| `POST` | `/export` | Generates the filled original or response sheet. |

Supported language codes: `en-IN`, `hi-IN`, `bn-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `od-IN`, `pa-IN`, `ta-IN`, `te-IN`.

Routes allow up to 40 requests per IP per minute. Uploads are limited to 10 MB; form extraction is bounded to 25 fields. The UI advertises a three-page prototype scope, which is not a universal server-enforced page-count limit.

## State and privacy

- Answers and session state live in browser memory; the client sends the current values with each conversation turn. Reloading loses progress.
- Uploaded originals are held in a process-local map. Export reuses a native original only within its 30-minute eligibility window and while that server process retains it. The timestamp is not a guarantee that bytes are purged after 30 minutes.
- Sarvam receives the content needed for the requested operation. Browser speech recognition may use the browser vendor's service. This is an online application.
- Request logging omits bodies and query strings. Do not add transcripts, answers, documents, or secrets to logs or bug reports.

## Checks and contributing

Run from the root in the supported environment:

```bash
pnpm run typecheck
PORT=5173 BASE_PATH=/ pnpm run build
```

The build command also runs type-checking. For API changes, edit `lib/api-spec/openapi.yaml` first, then regenerate the clients:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Use the [demo walkthrough](../DEMO.md) for manual regression checks: spoken and typed answers, language switching, invalid phone input, corrections, review, and PDF export. Existing provider results and timing observations are documented there; they are not an automated test suite.

Keep the reliability rules in [replit.md](../replit.md): validate model patches, serialize active turns, ignore stale responses, and preserve accepted answers when an upstream call fails. Open a pull request describing the behavior changed and the checks actually run.

## Deployment

The reference deployment uses Replit Autoscale. Configure `SARVAM_API_KEY` in production secrets, build both packages, and route the web app and `/api` under the same origin.

- Web output: `artifacts/bolform/dist/public`.
- API start: `pnpm --filter @workspace/api-server run start` after building.
- Include `artifacts/api-server/assets/fonts` in the deployed API filesystem.

After publishing, check one real microphone turn and one PDF export. A successful health response or a configured key alone does not prove those flows.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Native dependency errors on macOS/Windows | Use Linux x64; the workspace excludes other platform binaries. |
| Local API requests return 404 | Set `API_PROXY_TARGET=http://localhost:8080` for Vite and keep the API running. |
| Microphone unavailable | Open the app in its own tab, check permission, or type an answer. |
| Screen and spoken prompts use different languages | The two language pickers are independent. |
| An answer is not filled | Retry one clear detail or use typing/review; check the provider configuration if errors persist. |
| Original PDF layout is not preserved | Only supported uploaded fillable PDFs qualify; expired originals and other forms use a response sheet. |
| Indic text appears as `?` in the response sheet | Check that the required Noto font files are included in the API deployment. |
