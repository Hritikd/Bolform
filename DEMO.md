# BolForm demo and verification

## 90-second demonstration

1. Open the BolForm preview. Point out: “फ़ॉर्म भरने की झंझट नहीं। बस बोलें।” / “Don’t fill forms. Just speak.”
2. Keep **हिन्दी** selected. Open **Examples** and choose the fictional school admission enquiry.
3. Select **Start filling**. BolForm explains what the form is for and says it will proceed one detail at a time. After it asks for the student name, say: “अनन्या शर्मा।”
4. Stop speaking normally. Show that the name appears immediately and the next spoken question starts without waiting for a complete audio download.
5. Answer each short question directly: “सातवीं”, “कविता शर्मा”, “जयपुर”, and “पुणे”.
6. When asked for a phone number, say: “12345।” Show that it is rejected immediately and BolForm asks for 10 digits.
7. Use a clearly fictional 10-digit number and add a preferred contact time. Pause, open review, edit one answer to demonstrate corrections, and export the PDF.
8. Reset. Paste a small unrelated form or choose the volunteer example to demonstrate that the question set is generic.

## Live verification completed

- Sarvam chat: a Hindi school-enquiry answer populated five relevant fields.
- Sarvam correction: “छठी नहीं, सातवीं” proposed only the class field update.
- Sarvam streaming TTS: Bulbul v3 begins returning MP3 audio before the complete response is generated.
- Sarvam STT: Saaras v3 transcribed the synthetic Hindi TTS recording correctly.
- Sarvam Document AI: the generated non-fillable volunteer PDF produced six blank-field definitions.
- Native PDF: the generated fillable school PDF exposed eight AcroForm bindings and exported as a valid PDF.

These are live API checks, not mocked provider results. Synthetic TTS-to-STT proves the API pipeline, not recognition quality in a real room.

## Latency verification

- Common one-answer form updates: **1–10 ms** measured server response time
- Short spoken prompt first byte: **171–470 ms** across repeated checks
- Longer Hindi introduction first byte: **488 ms** while the remaining audio continued streaming
- Supported Chrome/Android browsers use live browser transcription to avoid waiting for a completed recording upload
- Sarvam batch transcription remains the compatibility fallback and can take longer than 600 ms
- Complex corrections or multi-field sentences intentionally use the reasoning model and can take longer; keep the live demo to the guided one-answer-at-a-time path

## Local checks

- `pnpm run typecheck`
- `pnpm run build`
- API checks through `http://localhost:80/api/...` for examples, conversation, TTS, STT, document import, and export
- Browser preview checked at desktop and phone viewport sizes

## Supported prototype boundary

- Files: fillable or non-fillable PDF, PNG, JPEG, and pasted text
- Limits: 10 MB, up to 3 pages, up to 25 fields, 25 seconds per recording
- Thoroughly tested speaking languages: Hindi (`hi-IN`) and English (`en-IN`)
- Native fillable PDFs: supported text bindings are filled in the original PDF
- Scans, images, non-fillable PDFs, and pasted forms: a labelled “Completed response sheet” is generated
- Manual only: signatures, attachments, attestations, unsupported structures, and unclear scans
- Not supported: automatic submission, arbitrary websites, CAPTCHAs, payments, or a claim that a response sheet is accepted by an issuing institution

## Microphone check for the owner

Use a new browser tab if the embedded preview does not grant microphone permission. Test a quiet-room Hindi phrase, a code-mixed proper name, and normal background noise. Browser permission and real-room accent/noise quality were not proven by the synthetic pipeline.

## Publication

1. Confirm `SARVAM_API_KEY` is available in the production secrets scope.
2. Use Replit **Publish** for the full-stack app.
3. After publishing, run one short Hindi microphone turn and one PDF export to confirm production permissions and Sarvam access.

## Iteration evidence

1. The first live chat smoke test exhausted its token budget in model reasoning and returned no content. The implementation was refined to use documented low reasoning effort with a bounded larger completion budget; the repeated Hindi test then returned five correct patches.
2. The first Document AI schema was rejected because nested array items require descriptions. The schema was tightened at both nested levels, then the non-fillable volunteer fixture completed through the asynchronous job and returned six fields.