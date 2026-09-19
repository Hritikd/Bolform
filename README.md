# BolForm

**Don't fill forms. Just speak.** · **फ़ॉर्म भरने की झंझट नहीं। बस बोलें।**

BolForm turns any form — a PDF, a photo of a paper form, or pasted text — into a short spoken conversation. It asks for each detail one at a time in the language you speak, fills the form for you, lets you review and correct every answer, and gives you a ready-to-download PDF.

It is built for people in India who find forms hard: unfamiliar English labels, small print, unclear instructions. BolForm reads the form, asks plain questions in Hindi, Kannada, Telugu, Tamil, Bengali, Marathi, Gujarati, Malayalam, Odia, Punjabi or English, and writes the answers in the language the form itself asks for.

![BolForm setup screen](docs/screenshots/setup.jpg)

**Live demo:** https://bol-form-voice-form-assistant.replit.app

---

## Table of contents

- [What BolForm does](#what-bolform-does)
- [Who it is for](#who-it-is-for)
- [How a session works](#how-a-session-works)
- [Languages](#languages)
- [What it does not do](#what-it-does-not-do)
- [Quick start](#quick-start)
- [Using BolForm](#using-bolform)
- [How it works under the hood](#how-it-works-under-the-hood)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Configuration](#configuration)
- [Verification and testing](#verification-and-testing)
- [Deploying](#deploying)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License and acknowledgements](#license-and-acknowledgements)

---

## What BolForm does

| You | BolForm |
| --- | --- |
| Upload a PDF, a photo of a form, or paste its text | Reads the blank form and works out which details it asks for (up to 25 fields, 3 pages) |
| Tap the orb and speak | Detects the language you spoke, understands the answer, and fills the right field |
| Say "सातवीं", "seventh", or "ಏಳನೇ" for the class | Maps it to the option the form actually offers (`7`) |
| Say a name or a city in Kannada for an English form | Writes it in the form's script — "ಅನನ್ಯಾ ಶರ್ಮಾ" becomes "Ananya Sharma" |
| Say "12345" for a phone number | Says the number is not 10 digits and asks again — nothing wrong is stored |
| Say "छठी नहीं, सातवीं" (not sixth, seventh) | Corrects only the class field |
| Tap **Undo**, **Pause**, or **Review** | Steps back, stops listening, or shows every answer for manual editing |
| Tap **Download PDF** | Fills the original PDF if it has form fields; otherwise produces a clearly labelled response sheet |

Everything happens one question at a time. You never have to read the whole form.

## Who it is for

- People who are more comfortable speaking than reading or typing in English.
- Anyone helping a family member with a school admission enquiry, a volunteer sign-up, a membership form, or a similar document.
- Organisations that want to hand out a form and let people complete it by voice, then collect the PDF.

BolForm is a simple consumer tool, not a chatbot platform. It prepares the completed form; it never submits anything to an institution on your behalf.

## How a session works

1. **Choose the form** — upload a PDF or photo, paste text, or open a built-in sample (a fictional school admission enquiry and a fictional volunteer registration).
2. **Pick languages (optional)** — two pickers sit at the top right:
   - **Speaking language** (microphone icon): leave it on **Auto** and BolForm detects the language of each answer, or pin one language for the fastest response.
   - **Screen language** (translation icon): the language of the buttons and instructions, independent of what you speak.
3. **Start filling** — BolForm explains what the form is for and asks the first question aloud.
4. **Answer naturally** — the orb listens, stops when you pause, shows what it heard, fills the field, and asks the next question. You can also type an answer at any time.
5. **Review** — every answer is listed next to the original form. Edit anything by hand.
6. **Download** — get the PDF.

## Languages

| Spoken / screen language | Code | Spoken answers | Interface text | Voice replies |
| --- | --- | --- | --- | --- |
| Hindi | `hi-IN` | Yes | Built in | Yes |
| English | `en-IN` | Yes | Built in | Yes |
| Bengali | `bn-IN` | Yes | Machine translated | Yes |
| Gujarati | `gu-IN` | Yes | Machine translated | Yes |
| Kannada | `kn-IN` | Yes | Machine translated | Yes |
| Malayalam | `ml-IN` | Yes | Machine translated | Yes |
| Marathi | `mr-IN` | Yes | Machine translated | Yes |
| Odia | `od-IN` | Yes | Machine translated | Yes |
| Punjabi | `pa-IN` | Yes | Machine translated | Yes |
| Tamil | `ta-IN` | Yes | Machine translated | Yes |
| Telugu | `te-IN` | Yes | Machine translated | Yes |

- **Auto detection** works per answer: switch from Kannada to Hindi mid-form and BolForm follows you.
- **Form-language values**: names and places are transliterated into the form's script, other text is translated ("शाम छह बजे" → "Six o'clock in the evening" on an English form). If the form is in Hindi, answers stay in Devanagari.
- Exported PDFs embed Noto fonts so every supported script renders.

## What it does not do

BolForm is honest about its limits:

- It does **not** submit forms to any website, portal, or institution, and does not claim a generated response sheet is accepted by anyone.
- No signatures, attachments, attestations, CAPTCHAs, or payments.
- Scans, photos, and pasted forms produce a labelled *response sheet*, not a pixel-perfect copy of the original layout. Native fillable PDFs are filled in place.
- Prototype limits: files up to 10 MB, 3 pages, 25 fields, 25 seconds per recording.

## Quick start

### Prerequisites

- **Node.js 20+** and **pnpm 10+** (`corepack enable && corepack prepare pnpm@latest --activate`)
- A **Sarvam AI API key** — https://dashboard.sarvam.ai (Sarvam powers speech recognition, speech synthesis, translation, transliteration, document extraction, and the conversation model)

### 1. Clone and install

```bash
git clone https://github.com/Hritikd/Bolform.git
cd Bolform
pnpm install
```

### 2. Configure

The API server reads `SARVAM_API_KEY` from the environment. Never put it in browser code or commit it.

```bash
export SARVAM_API_KEY=your_key_here
```

### 3. Run the API server

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

### 4. Run the web app (second terminal)

```bash
PORT=5173 BASE_PATH=/ API_PROXY_TARGET=http://localhost:8080 pnpm --filter @workspace/bolform run dev
```

Open http://localhost:5173, allow microphone access, choose **Try Sample**, and start speaking.

> On Replit the two services are managed workflows and `/api` is routed automatically, so `API_PROXY_TARGET` is not needed there.

### Useful commands

| Command | What it does |
| --- | --- |
| `pnpm run typecheck` | Type-checks every package |
| `pnpm run build` | Type-checks and builds all packages (`PORT` and `BASE_PATH` must be set for the web build) |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerates the typed React hooks and Zod schemas after editing `lib/api-spec/openapi.yaml` |

## Using BolForm

**Voice tips**

- Answer one detail at a time — "अनन्या शर्मा", then "सातवीं", then "जयपुर". Short answers are handled instantly on the server (a few milliseconds plus any script conversion).
- Full sentences and corrections work too ("मेरा नाम अनन्या शर्मा है और मैं जयपुर में रहती हूँ" fills two fields) but go through the language model and take about one to two seconds.
- BolForm never records while it is speaking. Wait for the question to finish, then answer.
- If the microphone is blocked, the question stays on screen and you can type instead.

**Bringing your own form**

- Fillable PDF: fields are detected from the PDF itself and filled in place on export.
- Scanned PDF, PNG, or JPEG: Sarvam Document AI extracts the blank fields.
- Pasted text: the language model extracts a field list. Requiredness and constraints are never invented.

## How it works under the hood

```
Browser (React + Vite)                      API server (Express)                     Sarvam AI
─────────────────────                      ────────────────────                     ─────────
upload / paste / sample  ───────────────▶  /import, /parse-text  ───────────────▶  Document AI, chat model
                                            native PDF fields read with pdf-lib
tap orb → record (or live browser STT) ─▶  /transcribe (language=auto|fixed) ───▶  Saaras v3 speech-to-text
transcript + language ─────────────────▶  /turn
                                            ├─ deterministic single-field path (ms)
                                            ├─ option matching, phone/email checks
                                            ├─ value → form language ───────────▶  translate / transliterate
                                            └─ sentences & corrections ─────────▶  sarvam-105b-conversations
next question text ◀────────────────────   localized, cached, pre-warmed ◀──────  translate
question audio ◀─ streamed MP3 ◀────────  /speak-stream ─────────────────────────▶  Bulbul v3 text-to-speech
review → edit → /export ───────────────▶  fill AcroForm or draw response sheet (Noto fonts)
```

Design decisions worth knowing:

- **Guided, one field at a time.** Every question names an exact field, so a short answer can be applied without a model call. Only sentences, multi-field answers, and corrections use the model.
- **Server owns validation.** Model output is filtered to known field IDs, select options, 10-digit phone rules, and email shape before it can change state. Unverifiable answers are dropped and the question is repeated — never a network error.
- **Language detection is script-first.** Indic script in the transcript decides the language; Latin text is English only when the recogniser says so, because a bare name like "Ananya Sharma" is language-neutral.
- **Nothing is stored.** Uploaded files and answers live in browser memory and a short-lived in-process map on the server. There is no database, no accounts, no analytics.
- **Latency budget.** Live browser transcription (when a language is pinned), deterministic field handling, cached question translations, and streamed speech keep the guided path fast. Auto mode adds one Sarvam transcription per answer (roughly 200–700 ms).

## Project structure

```
.
├── artifacts/
│   ├── bolform/                 # React + Vite web app
│   │   └── src/
│   │       ├── pages/Home.tsx   # complete product flow and session state
│   │       ├── hooks/           # microphone recorder, upload/transcribe/export clients
│   │       ├── components/      # voice orb and UI primitives
│   │       └── lib/ui-strings.json  # interface text for the nine machine-translated languages
│   └── api-server/              # Express API
│       ├── src/routes/bolform.ts   # public endpoints, limits, short-lived file scoping
│       ├── src/lib/bolform.ts      # Sarvam clients, language handling, validation, PDF generation
│       └── assets/fonts/           # Noto fonts embedded in exported PDFs
├── lib/
│   ├── api-spec/openapi.yaml    # source of truth for the typed JSON API
│   ├── api-client-react/        # generated React Query hooks
│   └── api-zod/                 # generated request/response schemas
├── DEMO.md                      # demo script, measured latencies, verification evidence
├── replit.md                    # engineering notes and reliability rules
└── docs/screenshots/
```

## API overview

All endpoints are under `/api/bolform`. The JSON ones are defined in `lib/api-spec/openapi.yaml`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/status` | Whether the Sarvam key is configured |
| `GET` | `/examples` | Built-in sample forms |
| `GET` | `/examples/:id/pdf` | Generated PDF for a sample |
| `POST` | `/import` | Upload a PDF/PNG/JPEG; returns the field schema |
| `POST` | `/parse-text` | Extract a schema from pasted text |
| `POST` | `/turn` | Apply one spoken/typed answer; returns patches and the next question |
| `POST` | `/transcribe` | Speech to text (`X-Language: auto` or a language code) |
| `GET` | `/speak-stream` | Streamed MP3 for a question |
| `POST` | `/speak` | Non-streamed audio fallback |
| `POST` | `/localize` | Translate interface strings (bounded: 80 strings × 300 chars) |
| `POST` | `/export` | Produce the filled PDF or response sheet |

Requests are rate-limited per IP and bounded in size; uploaded bytes are scoped to a short-lived session.

## Configuration

| Variable | Where | Required | Notes |
| --- | --- | --- | --- |
| `SARVAM_API_KEY` | API server | Yes | Server-side only |
| `PORT` | both | Yes | Each service reads its own port |
| `BASE_PATH` | web app | Yes | `/` when served at the root |
| `API_PROXY_TARGET` | web app (local dev) | No | Forwards `/api` to the API server outside Replit |
| `SARVAM_CHAT_MODEL` | API server | No | Defaults to `sarvam-105b-conversations`. The reasoning model `sarvam-105b` is much slower for this use |
| `LOG_LEVEL` | API server | No | pino log level |

## Verification and testing

- `pnpm run typecheck` and `pnpm run build` must pass.
- `DEMO.md` records live checks against Sarvam (chat, corrections, streaming TTS, STT, Document AI, native PDF fill) and measured latencies.
- Browser flows verified at phone and desktop sizes: language switching mid-form, Kannada and Hindi typed answers, phone validation, PDF export with Indic text.
- Logs never contain transcripts, answers, uploaded bytes, or secrets.

## Deploying

BolForm runs as two services: the API server (`pnpm --filter @workspace/api-server run start` after `build`) and the static web build (`artifacts/bolform/dist/public`) served under the same origin with `/api` routed to the API server. The reference deployment is Replit Autoscale with `SARVAM_API_KEY` in the production secrets. After deploying, run one spoken turn and one PDF export to confirm microphone permission and Sarvam access.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Microphone permission was not granted" | Browser blocked the mic, or the page is inside an iframe | Open the app in its own tab and allow the microphone; typing still works |
| Questions are in English on a Kannada screen | The screen-language picker, not the speaking one, controls interface text | Set the second picker |
| Interface strings show English for a rare label | Machine translation fell back to English | Expected; core screens are covered |
| `/turn` replies "I did not fill that answer" | The model could not verify the answer | Repeat one detail at a time |
| Export returns an error | Font assets missing from the deployed API server | Ensure `artifacts/api-server/assets/fonts` ships with the build |
| Local dev: API calls 404 | Vite is not proxying `/api` | Set `API_PROXY_TARGET=http://localhost:8080` |

## Privacy

- Files and answers are held in browser memory and a short-lived server map; nothing is written to disk or a database.
- Audio, text, and images are sent to Sarvam AI for processing under their terms.
- Sample forms are fictional and say so on the page.

## Roadmap

- Human-reviewed interface translations for the nine machine-translated languages
- Date-field handling on the fast path
- Payments and hosted sharing are intentionally on hold

## Contributing

1. Fork and create a branch.
2. Edit `lib/api-spec/openapi.yaml` first for any API change, then run codegen.
3. Keep the reliability rules in `replit.md`: never fake provider results, validate every model patch server-side, one active turn at a time, no logging of user data.
4. Run `pnpm run typecheck` and `pnpm run build`, then open a pull request describing what you verified.

## License and acknowledgements

- MIT License.
- Speech, translation, and language models by [Sarvam AI](https://www.sarvam.ai/) (Saaras v3, Bulbul v3, Mayura translation, sarvam-105b-conversations, Document AI).
- PDF handling with [pdf-lib](https://pdf-lib.js.org/); exported PDFs embed [Noto fonts](https://github.com/notofonts) under the SIL Open Font License.
