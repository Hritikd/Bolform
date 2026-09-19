# Try BolForm

[← Back to BolForm](README.md) · [Open the live demo](https://bol-form-voice-form-assistant.replit.app) · [Build story](docs/BUILD_STORY.md)

## Two-minute walkthrough

**The story:** a parent can answer a school enquiry in Hindi while BolForm prepares the English form values. All details below are fictional. Allow extra time for provider responses and microphone permissions.

1. Open the [live app](https://bol-form-voice-form-assistant.replit.app) in its own browser tab. Set **Screen language** to **English** to match these labels; leave **Speaking language** on **Auto**.
2. Choose **Try Sample** → **Sahyog Learning Centre — Admission Enquiry** → **Start filling**. Allow the microphone when prompted.
3. Wait for each question to finish, then answer with the matching detail below. The app stops recording after speech followed by silence. You can type if a microphone is unavailable.

| When asked for… | Say or type… | Expected result |
| --- | --- | --- |
| Student name | `अनन्या शर्मा` | Name converted into the English form's script; review the spelling. |
| Class sought | `सातवीं` | Class `7` selected. |
| Parent / guardian name | `कविता शर्मा` | Guardian name filled. |
| Current city | `जयपुर` | Current city filled as Jaipur. |
| Intended admission city | `पुणे` | Admission city filled as Pune. |
| Contact phone | `12345` | Rejected as incomplete; the phone question is asked again. |
| Contact phone, retry | `0000000000` | Passes this sample's length check; this is a dummy value, not a real phone number. |
| Preferred contact time | `शाम छह बजे` | Contact time converted into English. |

4. In **Review answers**, inspect the fields and edit the contact time. Select **Download PDF** and open the file. The built-in sample exports a labelled **Completed response sheet**.

The phone check validates length, not ownership or whether a number can receive calls. Proper-name spellings and AI translations should be reviewed.

## Three moments worth showing

- **Your language → the form's language.** Speak Hindi while completing the English sample. Show the resulting values in review.
- **A correction without restarting.** During the conversation, after entering the class, say “छठी नहीं, सातवीं” (“not sixth, seventh”). Inspect that the class is `7` and unrelated accepted answers remain unchanged. Undo and manual review offer additional ways to correct an answer.
- **A different form, the same flow.** Start a new session and choose **Nayi Disha Community Day — Volunteer Registration**, or paste the short form below.

```text
Community reading club — fictional demo
Full name (required):
City (required):
Preferred day: Saturday or Sunday (required)
```

For an additional language demonstration, leave speaking mode on **Auto** and answer a later question in another supported language. Screen language remains independent. Pinning a speaking language enables browser transcription where supported, but no longer demonstrates auto detection.

## Try the original-PDF path

The sample button loads a schema directly. To demonstrate filling an uploaded original instead:

1. Download the [blank fillable school PDF](https://bol-form-voice-form-assistant.replit.app/api/bolform/examples/school-enquiry/pdf).
2. Start a new session and upload that PDF through **Choose File**.
3. Answer with fictional details, review, and export within the same session.

Supported uploaded text fields are filled in the original PDF. Scans, photos, pasted forms, built-in samples, and fallback exports produce response sheets. If the original expires or is unavailable to the server, the export can also fall back to a response sheet.

## Recorded development verification

The following results were already recorded in this repository during development. They are preserved as historical observations, not represented as newly executed tests or guarantees for the current deployment.

| Component | Recorded result |
| --- | --- |
| Sarvam conversation | A Hindi school-enquiry answer populated five relevant fields. |
| Spoken correction | “छठी नहीं, सातवीं” proposed only the class update. |
| Streaming speech | Bulbul v3 returned MP3 data before generation completed. |
| Transcription | Saaras v3 transcribed a synthetic Hindi TTS recording. |
| Document extraction | A non-fillable volunteer PDF yielded six field definitions. |
| Native PDF | A fillable school PDF exposed eight AcroForm bindings and exported as a valid PDF. |

Synthetic TTS-to-STT checks exercise the provider pipeline. They do not establish real-room recognition quality, accent coverage, or performance in noise.

### Recorded component timings

| Measurement | Previously recorded range |
| --- | --- |
| Common English single-answer server update | 1–20 ms |
| Additional script conversion | Approximately 0.5 s |
| Conversation-model sentences and corrections | 0.3–2 s |
| Short spoken prompt, first audio byte | 171–470 ms |
| Longer Hindi introduction, first audio byte | 488 ms |
| Auto-mode batch transcription | 210–700 ms |

These are development observations, not an end-to-end latency promise. Recording time, silence detection, network conditions, language conversion, and provider response time all affect the experience.

### Presentation review — 19 September 2026

- The published homepage returned HTTP 200 and displayed the upload screen, language pickers, and both fictional samples.
- `/api/healthz` returned `{"status":"ok"}`.
- `/api/bolform/status` reported the Sarvam key configured, with Document AI access still `unchecked` until use. This endpoint checks configuration, not provider connectivity.

This documentation review did not rerun the historical provider checks, real microphone tests, or full application build. The developer commands are in the [developer guide](docs/DEVELOPMENT.md#checks-and-contributing).

## Before presenting

- Open the app in its own tab and confirm microphone permission with a real spoken answer.
- Use fictional details; audio, text, and documents may be processed by Sarvam AI, and browser recognition may use a browser service.
- Confirm one full review-and-export flow on the device you will present from.
- Keep the sample form available. If audio is unavailable, use typed answers and describe that limitation plainly.

The prototype is intended for forms up to three pages and 25 fields, with uploads up to 10 MB and recordings up to 25 seconds. Signatures, attachments, CAPTCHAs, payments, submission, and institutional acceptance remain outside the demonstrated scope.
