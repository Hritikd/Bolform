---
name: Sarvam structured calls
description: Non-obvious runtime constraints observed while validating Sarvam chat and Document AI.
---

Use low reasoning effort with an adequate completion-token budget for structured `sarvam-105b` responses. A small token budget can be consumed entirely by reasoning and return null content.

**Why:** A live JSON smoke test ended with `finish_reason: length`, non-empty reasoning, and no response content until reasoning effort and token budget were set explicitly.

**How to apply:** Keep structured conversation calls bounded, low-temperature, and validate that message content exists before parsing.

Every nested field in a Document AI extraction schema—including array item schemas and primitive item schemas—needs a non-empty description.

**Why:** Live extraction rejected otherwise valid nested arrays one level at a time until descriptions existed on both object items and string items.

**How to apply:** Audit descriptions recursively before submitting a Document AI job; treat schema rejection as an input error and do not retry unchanged.