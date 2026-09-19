# Building BolForm with Replit Agent

[← Back to BolForm](../README.md) · [Try the demo](https://bol-form-voice-form-assistant.replit.app) · [Demo walkthrough](../DEMO.md)

The goal was a form-filling experience for people who are more comfortable speaking than reading or typing form labels. That meant making the first action obvious, keeping spoken turns short, and giving people a result they could review and download.

The history below is drawn from committed changes and the repository's development notes. The linked Agent iterations carry `Replit Agent` authorship; the later language expansion is attributed separately. This is an implementation history, not a transcript of prompts or a claim of measured user impact.

## 1. Clarify the product

**Friction:** the experience needed to explain what someone should do and what they would get.

**Iteration:** the [positioning update](https://github.com/Hritikd/Bolform/commit/a0478956b40bf8cc821bd5a83d1a48245d14d269) refined the home screen and demo documentation. The [next interface pass](https://github.com/Hritikd/Bolform/commit/2dc8cb65d09089c30feacf8067417bbec81a734b) simplified the layout, restyled the voice orb, and included desktop and mobile screenshots.

**Visible result:** upload, sample, and paste entry points lead into a focused conversation, with review and PDF download as the outcome.

## 2. Design around the pauses

**Friction:** a voice conversation becomes awkward when each short answer waits for model generation and a complete audio download.

**Iteration:** Replit Agent [added a deterministic single-field path, browser speech recognition, and streamed text-to-speech](https://github.com/Hritikd/Bolform/commit/6621be2e241081f71a37cd1af4efa039dbee1488).

**Engineering choice:** the app already knows which field it asked about. A short answer can often be validated directly. Longer sentences and corrections still use the conversation model; language conversion may add provider calls even on a short-answer path.

## 3. Make real answers easier to handle

**Friction:** people say “सातवीं”, not necessarily `7`; prompts need natural wording; transcription and model failures need recoverable behavior.

**Iteration:** the [conversation refinement](https://github.com/Hritikd/Bolform/commit/ce49dd5ecf65d1584e9c52d2fe319c7ca9a546db) added class-word mapping, more natural Hindi questions, auto-language transcription, and a fallback that repeats the current question when the model response cannot be used.

**Visible result:** the form flow handles familiar spoken answers and can ask again without replacing previously accepted details.

## 4. Extend the language experience

The later [update by Hritik Datta](https://github.com/Hritikd/Bolform/commit/0e4c5ace9047cb0c018630cd66abe5d9a91a13b6) expanded support to 11 languages, bundled interface translations, improved conversion into the form's language, and added Indic fonts for response-sheet export.

Speaking language, interface language, and the form's language serve different needs. Keeping them separate lets someone speak Hindi, read English controls, and still prepare answers for the uploaded form.

## Provider failures informed the implementation

The original development notes record two useful feedback loops:

- **Empty chat output:** a reasoning-heavy model exhausted its completion budget. The initial adjustment reduced reasoning effort and bounded the completion budget; the current code uses `sarvam-105b-conversations` for conversation turns.
- **Rejected document schema:** Document AI required descriptions on nested array items. The schema was revised, and the recorded repeat check extracted six fields from the non-fillable volunteer fixture.

See [recorded verification and its limits](../DEMO.md#recorded-development-verification). The notes report component checks and timings, not a controlled benchmark or comprehensive testing across every language and browser.

## What to demonstrate

Show a Hindi answer becoming an English form value, a spoken class matching an actual option, and an invalid phone number prompting a retry. End with review and the downloaded PDF. Those moments connect the technical iteration to the original problem: helping someone turn information they already know into a usable document.
