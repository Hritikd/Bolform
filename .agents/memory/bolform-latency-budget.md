---
name: BolForm latency budget
description: Product latency target and the distinction between the guided fast path and slower compatibility paths.
---

BolForm's guided, one-answer-at-a-time interaction should keep the form update and spoken-response time-to-first-byte under 600 ms after a transcript is available. Do not describe slower batch transcription or complex reasoning paths as meeting that target.

**Why:** The live demonstration depends on immediate turn-taking. Large-model reasoning and completed-recording uploads introduce seconds of delay, while deterministic field handling, live transcription, and streaming speech can respond within the target.

**How to apply:** Preserve the deterministic path for short single-field answers, streaming speech playback, and live browser transcription with an auto-language batch fallback. Every guided turn must name the exact expected field; generic prompts can route a valid answer to the wrong field and force slow reasoning. If reasoning fails, preserve answers and repeat the specific question instead of surfacing a network error. Benchmark first-byte latency after changes and keep demo prompts to one answer at a time.