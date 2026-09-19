import express, { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import {
  GetBolformExamplesResponse, GetBolformStatusResponse, ParseFormTextBody, ParseFormTextResponse,
  ProcessConversationTurnBody, ProcessConversationTurnResponse, SynthesizeSpeechBody, SynthesizeSpeechResponse,
  LocalizeStringsBody, LocalizeStringsResponse,
} from "@workspace/api-zod";
import { conversationTurn, documentExtract, examples, exportResponse, inspectNativePdf, isSupportedLanguage, localizeMany, makeExamplePdf, parseTextWithSarvam, speechToText, streamTextToSpeech, textToSpeech } from "../lib/bolform";

const router: IRouter = Router();
const buckets = new Map<string, { count: number; reset: number }>();
const originals = new Map<string, { bytes: Uint8Array; expires: number; native: boolean }>();

router.use("/bolform", (req, res, next) => {
  const key = req.ip || "local";
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) buckets.set(key, { count: 1, reset: now + 60_000 });
  else if (++bucket.count > 40) { res.status(429).json({ error: "Please wait a moment before trying again." }); return; }
  next();
});

router.get("/bolform/status", (_req, res) => {
  const configured = Boolean(process.env.SARVAM_API_KEY);
  res.json(GetBolformStatusResponse.parse({
    configured, chat: configured ? "ready" : "blocked", speech: configured ? "ready" : "blocked",
    transcription: configured ? "ready" : "blocked", documentAi: configured ? "unchecked" : "blocked",
    message: configured ? "Sarvam is configured. Document access is checked when you upload." : "Add SARVAM_API_KEY to use voice and document understanding.",
  }));
});

router.get("/bolform/examples", (_req, res) => res.json(GetBolformExamplesResponse.parse(examples)));

router.post("/bolform/parse-text", async (req, res): Promise<void> => {
  const parsed = ParseFormTextBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please paste readable form text." }); return; }
  try { res.json(ParseFormTextResponse.parse(await parseTextWithSarvam(parsed.data.text))); }
  catch (error) { req.log.warn({ err: error }, "Form text parsing failed"); res.status(502).json({ error: "Sarvam could not structure this form. Please simplify the pasted questions and retry." }); }
});

router.post("/bolform/turn", async (req, res): Promise<void> => {
  const parsed = ProcessConversationTurnBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "That answer could not be processed safely." }); return; }
  try { res.json(ProcessConversationTurnResponse.parse(await conversationTurn(parsed.data))); }
  catch (error) { req.log.warn({ err: error }, "Conversation turn failed"); res.status(502).json({ error: "I could not understand that safely. Your previous answers are unchanged; please try again or type a shorter answer." }); }
});

router.post("/bolform/speak", async (req, res): Promise<void> => {
  const parsed = SynthesizeSpeechBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "That prompt cannot be spoken." }); return; }
  try { res.json(SynthesizeSpeechResponse.parse({ audioBase64: await textToSpeech(parsed.data.text, parsed.data.language), mimeType: "audio/wav" })); }
  catch (error) { req.log.warn({ err: error }, "Speech synthesis failed"); res.status(502).json({ error: "Audio is unavailable right now. The question remains visible." }); }
});

router.get("/bolform/speak-stream", async (req, res): Promise<void> => {
  const text = String(req.query.text ?? "").trim();
  const language = String(req.query.language ?? "hi-IN");
  if (!text || text.length > 500 || !isSupportedLanguage(language)) {
    res.status(400).json({ error: "That prompt cannot be spoken." });
    return;
  }
  try {
    const upstream = await streamTextToSpeech(text, language);
    if (!upstream.body) throw new Error("Speech stream returned no audio");
    res.status(200);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=300");
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (error) {
    req.log.warn({ err: error }, "Streaming speech synthesis failed");
    if (!res.headersSent) res.status(502).json({ error: "Audio is unavailable right now. The question remains visible." });
    else res.end();
  }
});

router.post("/bolform/localize", async (req, res): Promise<void> => {
  const parsed = LocalizeStringsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid localization request." }); return; }
  const entries = Object.entries(parsed.data.strings);
  if (entries.length > 80 || entries.some(([, text]) => typeof text !== "string" || text.length > 300)) {
    res.status(400).json({ error: "Too many or too long strings to localize." }); return;
  }
  res.json(LocalizeStringsResponse.parse({ strings: await localizeMany(parsed.data.strings, parsed.data.language) }));
});

router.post("/bolform/transcribe", expressRaw(12 * 1024 * 1024), async (req, res): Promise<void> => {
  const mime = String(req.headers["x-audio-mime"] || "audio/webm");
  const language = String(req.headers["x-language"] || "auto");
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) { res.status(400).json({ error: "No recording received." }); return; }
  try { res.json(await speechToText(req.body, mime, language)); }
  catch (error) { req.log.warn({ err: error }, "Transcription failed"); res.status(502).json({ error: "I could not transcribe that recording. Please retry or type instead." }); }
});

router.post("/bolform/import", expressRaw(10 * 1024 * 1024), async (req, res): Promise<void> => {
  const mime = String(req.headers["content-type"] || "application/octet-stream").split(";")[0];
  const filename = decodeURIComponent(String(req.headers["x-filename"] || "uploaded-form"));
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) { res.status(400).json({ error: "No form file received." }); return; }
  if (!["application/pdf", "image/png", "image/jpeg"].includes(mime)) { res.status(415).json({ error: "Use a PDF, PNG, or JPEG file." }); return; }
  try {
    const native = mime === "application/pdf" ? await inspectNativePdf(req.body, filename) : null;
    const schema = native ?? await documentExtract(req.body, mime, filename);
    originals.set(schema.id, { bytes: Uint8Array.from(req.body), expires: Date.now() + 30 * 60_000, native: Boolean(native) });
    res.json(schema);
  }
  catch (error) { req.log.warn({ err: error }, "Document extraction failed"); res.status(502).json({ error: "The document could not be read. Try a clearer image or paste the questions." }); }
});

router.get("/bolform/examples/:id/pdf", async (req, res): Promise<void> => {
  const schema = examples.find((item) => item.id === req.params.id);
  if (!schema) { res.status(404).end(); return; }
  const pdf = await makeExamplePdf(schema, req.params.id === "school-enquiry");
  res.type("application/pdf");
  if (req.query.preview !== "1") res.attachment(`${schema.id}-blank.pdf`);
  res.send(Buffer.from(pdf));
});

router.post("/bolform/export", expressJsonLimit("2mb"), async (req, res): Promise<void> => {
  const { schema, values } = req.body ?? {};
  if (!schema || !Array.isArray(schema.fields) || !Array.isArray(values)) { res.status(400).json({ error: "Review data is incomplete." }); return; }
  try {
    const saved = originals.get(schema.id);
    const original = saved && saved.expires > Date.now() && saved.native ? saved.bytes : undefined;
    const pdf = await exportResponse(schema, values, original);
    res.type("application/pdf").attachment("bolform-response-sheet.pdf").send(Buffer.from(pdf));
  } catch (error) { req.log.warn({ err: error }, "PDF export failed"); res.status(500).json({ error: "The PDF could not be created." }); }
});

function expressRaw(limit: number) {
  return express.raw({ type: "*/*", limit });
}

function expressJsonLimit(limit: string) {
  return express.json({ limit });
}

export default router;