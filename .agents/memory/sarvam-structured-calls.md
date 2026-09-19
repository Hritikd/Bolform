---
name: Sarvam structured calls
description: Non-obvious runtime constraints observed while validating Sarvam chat and Document AI.
---

Use `sarvam-105b-conversations` for structured JSON turns: it answers directly in 0.3–0.7 s. `sarvam-105b` is a reasoning model: with `reasoning_effort: low` it still spends 700–1,600 tokens thinking, so a 900-token budget ends with `finish_reason: length` and `content: null`, and a 3,000-token budget takes 10–20 s. `reasoning_effort` only accepts low/medium/high; `sarvam-m` and `sarvam-30b` are deprecated (400).

**Why:** A live JSON smoke test ended with `finish_reason: length`, non-empty reasoning, and no response content until reasoning effort and token budget were set explicitly.

**How to apply:** Keep structured conversation calls bounded, low-temperature, and validate that message content exists before parsing.

Every nested field in a Document AI extraction schema—including array item schemas and primitive item schemas—needs a non-empty description.

**Why:** Live extraction rejected otherwise valid nested arrays one level at a time until descriptions existed on both object items and string items.

**How to apply:** Audit descriptions recursively before submitting a Document AI job; treat schema rejection as an input error and do not retry unchanged.