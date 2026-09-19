import { useState, useRef, useEffect } from "react";
import { UploadCloud, FileText, Languages, ArrowRight, Save, CheckCircle2, RotateCcw, AlertCircle, ArrowLeft, PauseCircle, Play, Mic, FileType, AlignLeft, Loader2 } from "lucide-react";
import { useGetBolformStatus, useGetBolformExamples, useParseFormText, useProcessConversationTurn } from "@workspace/api-client-react";
import { useImportForm, useTranscribeAudio, useExportForm } from "../hooks/use-manual-apis";
import type { FormSchema, FieldValue, ConversationInputLanguage, FieldPatch } from "@workspace/api-client-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useAudioRecorder } from "../hooks/use-audio-recorder";
import { VoiceOrb, type VoiceState } from "../components/voice-orb";
import { cn } from "../lib/utils";

type SessionState = "setup" | "orientation" | "workspace" | "review";

const TRANSLATIONS = {
  'hi-IN': {
    brandSubtitle: "फ़ॉर्म भरने की झंझट नहीं। बस बोलें।",
    introText: "कोई भी फ़ॉर्म अपलोड करें। हम आपसे एक-एक करके जानकारी पूछेंगे और आपका PDF तैयार कर देंगे।",
    privacy: "आपकी जानकारी सुरक्षित है। यह सिर्फ आपका PDF तैयार करता है।",
    uploadLabel: "फ़ॉर्म अपलोड करें",
    uploadSub: "PDF या फ़ोटो चुनें",
    pasteLabel: "टेक्स्ट पेस्ट करें",
    exampleLabel: "उदाहरण देखें",
    reading: "फ़ॉर्म पढ़ा जा रहा है...",
    start: "भरना शुरू करें",
    totalFields: "कुल सवाल",
    weWillAsk: "हम एक-एक करके आपसे पूछेंगे। बस सामान्य रूप से बोलें।",
    pause: "रोकें",
    resume: "बोलें",
    undo: "पीछे जाएँ",
    review: "जवाब जाँचे",
    reviewTitle: "अपने जवाब जाँचे",
    download: "PDF डाउनलोड करें",
    downloading: "डाउनलोड हो रहा है...",
    edit: "बदलें",
    typeAnswer: "या टाइप करें...",
    send: "भेजें",
    listening: "सुन रहे हैं... बोलकर खत्म होने पर टैप करें।",
    understanding: "समझ रहे हैं...",
    pausedStatus: "रुका हुआ है। बोलने के लिए टैप करें।",
    readyStatus: "तैयार है। बोलने के लिए टैप करें।",
    iHeard: "हमने सुना:",
    seeForm: "फ़ॉर्म देखें",
    liveAnswers: "आपके जवाब",
    originalDoc: "असली फ़ॉर्म",
    step: (c: number, t: number) => `${t} में से ${c}`,
    chooseFile: "फ़ाइल चुनें",
    extracting: "निकाला जा रहा है...",
    processText: "टेक्स्ट का उपयोग करें",
    backToStart: "शुरुआत में जाएँ",
    close: "बंद करें"
  },
  'en-IN': {
    brandSubtitle: "Don't fill forms. Just speak.",
    introText: "Upload any form. We'll ask for the details one by one and give you a ready-to-download PDF.",
    privacy: "Nothing is submitted online. This safely prepares your PDF.",
    uploadLabel: "Upload Form",
    uploadSub: "Choose a PDF or Photo",
    pasteLabel: "Paste Text",
    exampleLabel: "Try Sample",
    reading: "Reading Form...",
    start: "Start filling",
    totalFields: "Questions to answer",
    weWillAsk: "We will ask you one by one. Just speak naturally.",
    pause: "Pause",
    resume: "Speak",
    undo: "Undo",
    review: "Review answers",
    reviewTitle: "Review your answers",
    download: "Download PDF",
    downloading: "Downloading...",
    edit: "Edit",
    typeAnswer: "Or type your answer...",
    send: "Send",
    listening: "Listening... Tap when done.",
    understanding: "Understanding...",
    pausedStatus: "Paused. Tap to speak.",
    readyStatus: "Ready. Tap to speak.",
    iHeard: "I heard:",
    seeForm: "See Form",
    liveAnswers: "Live Answers",
    originalDoc: "Original Document",
    step: (c: number, t: number) => `${c} of ${t}`,
    chooseFile: "Choose File",
    extracting: "Extracting...",
    processText: "Process Text",
    backToStart: "Back to Start",
    close: "Close"
  }
};

export default function Home() {
  const { data: status, isLoading: isStatusLoading } = useGetBolformStatus();
  
  const [sessionState, setSessionState] = useState<SessionState>("setup");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [language, setLanguage] = useState<ConversationInputLanguage>("hi-IN");
  
  const [activeSchema, setActiveSchema] = useState<FormSchema | null>(null);
  const [fieldValues, setFieldValues] = useState<FieldValue[]>([]);
  
  const [currentTurnId, setCurrentTurnId] = useState<string>("init");
  const [turnRevision, setTurnRevision] = useState<number>(0);
  
  const historyStack = useRef<Array<{
    turnId: string, 
    revision: number,
    question: string,
    values: FieldValue[]
  }>>([]);

  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [assistantAudioUrl, setAssistantAudioUrl] = useState<string | null>(null);
  const [typedReply, setTypedReply] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<"answers" | "original">("answers");
  const [showTyping, setShowTyping] = useState(false);

  const processTurnMutation = useProcessConversationTurn();
  const transcribeMutation = useTranscribeAudio();
  const parseTextMutation = useParseFormText();
  const importFileMutation = useImportForm();
  const exportFormMutation = useExportForm();

  const [pasteText, setPasteText] = useState("");
  const activeRequest = useRef(0);
  const [sourcePreview, setSourcePreview] = useState<{ url: string; mime: string } | null>(null);
  const [setupMode, setSetupMode] = useState<"upload" | "paste" | "examples">("upload");

  const t = TRANSLATIONS[language];

  const { isRecording, startRecording, stopRecording } = useAudioRecorder(
    async (blob) => {
      setVoiceState("understanding");
      try {
        const res = await transcribeMutation.mutateAsync({ blob, language });
        if (res.text) {
          setLastTranscript(res.text);
          processUserTurn(res.text);
        } else {
          setVoiceError(t.readyStatus);
          setVoiceState("idle");
        }
      } catch (err) {
        console.error("Transcription failed", err);
        setVoiceError("Microphone issue. Please tap to try again or type.");
        setVoiceState("error");
      }
    },
    (err) => {
      console.error("Audio error", err);
      setVoiceError(
        err.name === "NotAllowedError"
          ? "Microphone permission denied. Allow access in your browser, or type your answer."
          : "Microphone unavailable. Try again or type your answer."
      );
      setVoiceState("error");
    },
    25,
    {
      language,
      onInterimTranscript: (text) => setLastTranscript(text),
      onFinalTranscript: (text) => {
        setLastTranscript(text);
        processUserTurn(text);
      },
    },
  );

  if (isStatusLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary font-medium text-lg flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" /> Starting BolForm...
        </div>
      </div>
    );
  }

  const isBlocked = status && (status.chat === 'blocked' || status.speech === 'blocked' || status.transcription === 'blocked' || status.documentAi === 'blocked');
  if (isBlocked) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-sm border p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Service Unavailable</h2>
          <p className="text-destructive font-medium mb-4">{status.message || "Required AI providers are not fully configured or are blocked."}</p>
        </div>
      </div>
    );
  }

  const initSession = (schema: FormSchema, preview?: { url: string; mime: string }) => {
    setActiveSchema(schema);
    setFieldValues([]);
    setSourcePreview(preview ?? null);
    setSessionState("orientation");
    historyStack.current = [];
    setCurrentTurnId("init");
    setTurnRevision(0);
    setVoiceState("idle");
    setVoiceError(null);
    setShowFormPreview(false);
    setPreviewMode("answers");
    setShowTyping(false);
  };

  const startVoiceSession = async () => {
    setSessionState("workspace");
    if (!activeSchema) return;
    const requiredCount = activeSchema.fields.filter((field) => field.required === "required").length;
    const detailNames = activeSchema.fields.slice(0, 3).map((field) => field.label).join(", ");
    const initialQuestion = language === "hi-IN"
      ? `नमस्ते। यह ${activeSchema.title} फ़ॉर्म है। इसमें ${requiredCount || activeSchema.fields.length} ज़रूरी जानकारियाँ चाहिए, जैसे ${detailNames}। हम एक-एक करके सारी जानकारी भरेंगे। पहले अपना जवाब बताइए।`
      : `Hello. This is the ${activeSchema.title} form. It asks for ${requiredCount || activeSchema.fields.length} required details, including ${detailNames}. Let's go one at a time and fill everything together. Tell me your first answer when you're ready.`;
    setCurrentQuestion(initialQuestion);
    await playAssistantSpeech(initialQuestion);
  };

  const playAssistantSpeech = async (text: string) => {
    const params = new URLSearchParams({ text, language });
    setAssistantAudioUrl(`/api/bolform/speak-stream?${params.toString()}`);
    setVoiceState("speaking");
  };

  const handleAssistantAudioEnded = () => {
    if (sessionState === "workspace" && voiceState === "speaking") {
      startRecordingWrapper();
    }
  };

  const startRecordingWrapper = () => {
    setVoiceError(null);
    setLastTranscript("");
    setVoiceState("listening");
    startRecording();
  };

  const pauseVoiceSession = () => {
    activeRequest.current += 1;
    if (isRecording) stopRecording(true);
    setAssistantAudioUrl(null);
    setVoiceState("paused");
    setVoiceError(null);
  };

  const handleOrbClick = () => {
    if (voiceState === 'listening') {
      stopRecording();
    } else if (voiceState === 'idle' || voiceState === 'paused' || voiceState === 'error') {
      startRecordingWrapper();
    } else if (voiceState === 'speaking') {
      setAssistantAudioUrl(null);
      setVoiceState('paused');
    }
  };

  const submitTypedReply = (text: string) => {
    if (!text.trim()) return;
    if (voiceState === 'listening') {
      stopRecording(true);
    }
    setAssistantAudioUrl(null);
    setTypedReply("");
    setLastTranscript(text);
    processUserTurn(text);
  };

  const processUserTurn = async (text: string) => {
    if (!activeSchema) return;
    setVoiceState("understanding");
    setVoiceError(null);
    
    historyStack.current.push({
      turnId: currentTurnId,
      revision: turnRevision,
      question: currentQuestion,
      values: [...fieldValues]
    });

    const requestId = ++activeRequest.current;
    try {
      const res = await processTurnMutation.mutateAsync({
        data: {
          turnId: currentTurnId,
          revision: turnRevision,
          language,
          utterance: text,
          currentQuestion,
          schema: activeSchema,
          values: fieldValues
        }
      });

      if (requestId !== activeRequest.current) return;

      applyPatches(res.patches);
      setCurrentQuestion(res.nextQuestion);
      setCurrentTurnId(res.turnId);
      setTurnRevision(res.revision);

      if (res.complete) {
        setSessionState("review");
      } else {
        await playAssistantSpeech(`${res.reply} ${res.nextQuestion}`.trim());
      }
    } catch (err) {
      console.error("Failed to process turn:", err);
      historyStack.current.pop();
      setVoiceError("Network issue. Please try again.");
      setVoiceState("error");
    }
  };

  const handleUndo = () => {
    activeRequest.current += 1;
    const lastState = historyStack.current.pop();
    if (lastState) {
      if (voiceState === 'listening') stopRecording(true);
      setAssistantAudioUrl(null);
      setCurrentTurnId(lastState.turnId);
      setTurnRevision(lastState.revision);
      setCurrentQuestion(lastState.question);
      setFieldValues(lastState.values);
      setVoiceState("idle");
      setVoiceError(null);
    }
  };

  const applyPatches = (patches: FieldPatch[]) => {
    setFieldValues(prev => {
      const next = [...prev];
      for (const patch of patches) {
        const idx = next.findIndex(v => v.fieldId === patch.fieldId);
        if (idx !== -1) {
          next[idx] = { ...next[idx], value: patch.value, status: patch.status };
        } else {
          next.push({ fieldId: patch.fieldId, value: patch.value, status: patch.status });
        }
      }
      return next;
    });
  };

  const handleManualValueChange = (fieldId: string, value: string) => {
    setFieldValues(prev => {
      const next = [...prev];
      const idx = next.findIndex(v => v.fieldId === fieldId);
      if (idx !== -1) {
        next[idx] = { ...next[idx], value, status: "answered" };
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (!activeSchema) return;
    try {
      await exportFormMutation.mutateAsync({ schema: activeSchema, values: fieldValues });
    } catch (err) {
      console.error("Failed to export:", err);
    }
  };

  const resetSession = () => {
    activeRequest.current += 1;
    if (isRecording) stopRecording(true);
    setAssistantAudioUrl(null);
    setActiveSchema(null);
    setFieldValues([]);
    setCurrentQuestion("");
    setTypedReply("");
    setLastTranscript("");
    setPasteText("");
    if (sourcePreview?.url.startsWith("blob:")) URL.revokeObjectURL(sourcePreview.url);
    setSourcePreview(null);
    historyStack.current = [];
    setSessionState("setup");
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden relative selection:bg-primary/20">
      
      {sessionState === "setup" && (
        <div className="flex-1 overflow-y-auto px-4 py-8 md:p-12 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-700">
          
          <div className="absolute top-4 right-4 md:top-8 md:right-8 bg-white/50 backdrop-blur-sm p-1 rounded-full border shadow-sm flex items-center">
            <button 
              onClick={() => setLanguage("hi-IN")}
              className={cn("px-4 py-2 text-sm font-semibold rounded-full transition-all", language === "hi-IN" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              हिन्दी
            </button>
            <button 
              onClick={() => setLanguage("en-IN")}
              className={cn("px-4 py-2 text-sm font-semibold rounded-full transition-all", language === "en-IN" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              English
            </button>
          </div>

          <div className="text-center max-w-xl mx-auto mb-10 mt-10">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary mb-3">BolForm</h1>
            <p className="text-2xl font-semibold text-foreground mb-4">
              {t.brandSubtitle}
            </p>
            <p className="text-muted-foreground text-lg leading-relaxed px-4">
              {t.introText}
            </p>
          </div>

          <div className="w-full max-w-sm space-y-4">
            
            {setupMode === "upload" && (
              <label className="cursor-pointer block relative group">
                <div className="bg-white border-2 border-primary/20 hover:border-primary/50 transition-all rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-xl mb-1 text-foreground">{t.uploadLabel}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{t.uploadSub}</p>
                  <div className="bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-full text-base shadow-sm w-full group-hover:bg-primary/90 transition-colors">
                    {importFileMutation.isPending ? t.reading : t.chooseFile}
                  </div>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={importFileMutation.isPending}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const schema = await importFileMutation.mutateAsync(file);
                        initSession(schema, { url: URL.createObjectURL(file), mime: file.type });
                      } catch (err) {
                        console.error(err);
                      }
                    }
                  }}
                />
              </label>
            )}

            {setupMode === "paste" && (
              <div className="bg-white border rounded-3xl p-6 shadow-sm animate-in fade-in">
                <h3 className="font-bold text-lg mb-4">{t.pasteLabel}</h3>
                <Textarea 
                  placeholder="..."
                  className="min-h-[160px] resize-none text-base p-4 bg-background rounded-2xl border-input focus-visible:ring-primary mb-4"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <Button 
                  size="lg"
                  className="w-full rounded-full h-14 text-base font-semibold shadow-sm"
                  disabled={!pasteText.trim() || parseTextMutation.isPending}
                  onClick={async () => {
                    try {
                      const schema = await parseTextMutation.mutateAsync({ data: { text: pasteText } });
                      initSession(schema);
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                >
                  {parseTextMutation.isPending ? t.extracting : t.processText}
                </Button>
              </div>
            )}

            {setupMode === "examples" && (
              <div className="bg-white border rounded-3xl p-4 shadow-sm animate-in fade-in">
                <ExamplesList onSelect={(schema) => initSession(schema, { url: `/api/bolform/examples/${schema.id}/pdf?preview=1`, mime: "application/pdf" })} />
              </div>
            )}

            <div className="flex justify-center gap-4 pt-4">
               {setupMode !== "upload" && (
                 <button onClick={() => setSetupMode("upload")} className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center">
                   <UploadCloud className="w-4 h-4 mr-1.5" /> {t.uploadLabel}
                 </button>
               )}
               {setupMode !== "examples" && (
                 <button onClick={() => setSetupMode("examples")} className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center">
                   <FileType className="w-4 h-4 mr-1.5" /> {t.exampleLabel}
                 </button>
               )}
               {setupMode !== "paste" && (
                 <button onClick={() => setSetupMode("paste")} className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center">
                   <AlignLeft className="w-4 h-4 mr-1.5" /> {t.pasteLabel}
                 </button>
               )}
            </div>

            <p className="text-center text-xs font-medium text-muted-foreground pt-6 max-w-[260px] mx-auto">
              <CheckCircle2 className="w-4 h-4 inline-block mr-1 text-primary/60" /> {t.privacy}
            </p>
          </div>
        </div>
      )}

      {sessionState === "orientation" && activeSchema && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500 max-w-lg mx-auto w-full">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-primary/10">
            <FileText className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-4 text-foreground">{activeSchema.title}</h1>
          <p className="text-lg text-muted-foreground mb-10 px-4">{t.weWillAsk}</p>
          
          <div className="bg-white rounded-3xl p-6 w-full border shadow-sm mb-12 flex justify-between items-center">
            <span className="text-muted-foreground font-medium text-lg">{t.totalFields}</span>
            <span className="font-bold text-3xl text-primary bg-primary/5 px-4 py-1 rounded-2xl">{activeSchema.fields.length}</span>
          </div>

          <Button 
            size="lg" 
            className="w-full h-16 text-xl rounded-full shadow-md hover:shadow-lg transition-all font-bold" 
            onClick={startVoiceSession}
          >
            {t.start} <ArrowRight className="w-6 h-6 ml-2" />
          </Button>

          <Button variant="ghost" onClick={resetSession} className="mt-6 text-muted-foreground font-semibold">
            {t.backToStart}
          </Button>
        </div>
      )}

      {sessionState === "workspace" && activeSchema && (
        <div className="flex-1 flex flex-col relative animate-in fade-in duration-500 bg-background">
          
          {/* Header */}
          <div className="px-4 md:px-8 py-4 flex items-center justify-between shrink-0 bg-background z-10 relative">
            <Button variant="ghost" size="icon" onClick={resetSession} className="text-muted-foreground hover:text-foreground rounded-full h-10 w-10 bg-white/50 backdrop-blur-sm border shadow-sm">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="font-semibold text-primary bg-white border px-5 py-2 rounded-full shadow-sm text-sm">
               {t.step(fieldValues.length, activeSchema.fields.length)}
            </div>
            <div className="w-10 flex items-center justify-end">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleUndo} 
                disabled={historyStack.current.length === 0 || voiceState === 'understanding'}
                className="text-muted-foreground hover:text-foreground rounded-full h-10 w-10 bg-white/50 backdrop-blur-sm border shadow-sm disabled:opacity-30"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-10 overflow-y-auto relative z-10 pb-32">
            
            <div className="text-center w-full max-w-xl mx-auto space-y-3 min-h-[140px] flex flex-col justify-end">
              {voiceState === 'error' ? (
                <div className="text-destructive font-semibold bg-destructive/10 p-5 rounded-3xl border border-destructive/20 animate-in slide-in-from-bottom-2 text-lg">
                  {voiceError}
                </div>
              ) : (
                <h2 className="text-2xl md:text-4xl font-bold leading-tight tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-2">
                  {currentQuestion}
                </h2>
              )}
            </div>

            <div className="w-full flex justify-center py-4">
               <VoiceOrb 
                 state={voiceState} 
                 audioUrl={assistantAudioUrl} 
                 onAudioEnded={handleAssistantAudioEnded} 
                 onClick={handleOrbClick}
               />
            </div>

            <div className="h-10 flex flex-col items-center justify-center w-full">
              {voiceState === 'listening' && <p className="text-primary font-semibold animate-pulse text-base">{t.listening}</p>}
              {voiceState === 'understanding' && <p className="text-primary font-semibold animate-pulse text-base">{t.understanding}</p>}
              {voiceState === 'paused' && <p className="text-muted-foreground font-semibold text-base">{t.pausedStatus}</p>}
              {voiceState === 'idle' && !voiceError && <p className="text-muted-foreground font-semibold text-base">{t.readyStatus}</p>}
              
              {lastTranscript && voiceState !== 'understanding' && (
                <p className="text-sm text-foreground bg-white border rounded-full px-4 py-2 mt-4 shadow-sm animate-in fade-in max-w-md truncate">
                  <span className="text-muted-foreground font-medium">{t.iHeard} </span>{lastTranscript}
                </p>
              )}
            </div>

          </div>
          
          {/* Bottom Area: Typed Fallback & Actions */}
          <div className="absolute bottom-0 inset-x-0 p-4 md:p-6 bg-gradient-to-t from-background via-background to-transparent z-20 flex flex-col items-center gap-4">
            
            {showTyping ? (
              <div className="w-full max-w-md flex gap-2 animate-in fade-in slide-in-from-bottom-2">
                <Input 
                  placeholder={t.typeAnswer} 
                  value={typedReply}
                  autoFocus
                  onChange={(e) => setTypedReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitTypedReply(typedReply); }}
                  disabled={voiceState === 'understanding'}
                  className="h-14 bg-white border-border rounded-full focus-visible:ring-primary shadow-sm text-base px-6 font-medium"
                />
                <Button 
                  size="icon"
                  onClick={() => submitTypedReply(typedReply)}
                  disabled={!typedReply.trim() || voiceState === 'understanding'}
                  className="h-14 w-14 rounded-full font-semibold shadow-sm shrink-0"
                >
                  <ArrowRight className="w-6 h-6" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTyping(true)}
                className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 py-1"
              >
                <AlignLeft className="w-4 h-4" />
                {t.typeAnswer.replace("...", "")}
              </button>
            )}

            <div className="flex gap-4 w-full max-w-md">
               <Button variant="outline" className="flex-1 rounded-full font-semibold h-12 bg-white/80 backdrop-blur" onClick={() => setShowFormPreview(true)}>
                 {t.seeForm}
               </Button>
               <Button className="flex-1 rounded-full font-bold h-12 shadow-sm" onClick={() => setSessionState("review")}>
                 {t.review} <ArrowRight className="w-4 h-4 ml-1.5" />
               </Button>
            </div>
            
          </div>
          
          {/* Progressive Disclosure: Form Preview Overlay */}
          {showFormPreview && (
            <div className="absolute inset-0 bg-background z-50 flex flex-col animate-in slide-in-from-bottom-4">
               <div className="px-4 py-3 flex items-center justify-between border-b bg-white gap-3">
                  <div className="flex items-center gap-1 bg-muted rounded-full p-1">
                    <button
                      type="button"
                      onClick={() => setPreviewMode("answers")}
                      className={cn("px-4 py-2 rounded-full text-sm font-semibold transition-colors", previewMode === "answers" ? "bg-white text-primary shadow-sm" : "text-muted-foreground")}
                    >
                      {t.liveAnswers}
                    </button>
                    {sourcePreview && (
                      <button
                        type="button"
                        onClick={() => setPreviewMode("original")}
                        className={cn("px-4 py-2 rounded-full text-sm font-semibold transition-colors", previewMode === "original" ? "bg-white text-primary shadow-sm" : "text-muted-foreground")}
                      >
                        {t.originalDoc}
                      </button>
                    )}
                  </div>
                 <Button variant="ghost" size="sm" onClick={() => setShowFormPreview(false)} className="rounded-full font-semibold">
                   {t.close}
                 </Button>
              </div>
              <div className="flex-1 overflow-y-auto bg-muted/30">
                  {previewMode === "answers" || !sourcePreview ? (
                    <FormPreview schema={activeSchema} values={fieldValues} onValueChange={handleManualValueChange} />
                  ) : sourcePreview.mime.startsWith("image/") ? (
                    <img src={sourcePreview.url} alt={t.originalDoc} className="w-full h-full object-contain p-4" />
                  ) : (
                    <iframe src={sourcePreview.url} title={t.originalDoc} className="w-full h-full border-0" />
                  )}
              </div>
            </div>
          )}

        </div>
      )}

      {sessionState === "review" && activeSchema && (
        <div className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto p-4 md:p-8 animate-in fade-in duration-500 bg-background pb-32">
          
          <div className="flex items-center justify-between mb-8 mt-4">
            <Button variant="ghost" size="icon" onClick={() => setSessionState("workspace")} className="rounded-full bg-white border shadow-sm text-muted-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <div className="w-10" />
          </div>

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-3">{t.reviewTitle}</h1>
            <p className="text-muted-foreground font-medium">
              {t.privacy}
            </p>
          </div>
          
          <div className="bg-white rounded-3xl shadow-sm border overflow-hidden mb-8">
            <FormPreview 
              schema={activeSchema} 
              values={fieldValues} 
              onValueChange={handleManualValueChange}
            />
          </div>

          <div className="fixed bottom-0 inset-x-0 p-4 md:p-6 bg-gradient-to-t from-background via-background to-transparent z-20 flex justify-center">
            <div className="w-full max-w-xl">
              <Button 
                size="lg" 
                className="w-full rounded-full h-16 text-xl shadow-md font-bold" 
                onClick={handleExport} 
                disabled={exportFormMutation.isPending}
              >
                <Save className="w-6 h-6 mr-3" />
                {exportFormMutation.isPending ? t.downloading : t.download}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExamplesList({ onSelect }: { onSelect: (schema: FormSchema) => void }) {
  const { data: examples, isLoading } = useGetBolformExamples();
  
  if (isLoading) return <div className="text-center py-12 text-primary animate-pulse font-semibold">Loading...</div>;
  if (!examples?.length) return <div className="text-center py-12 text-muted-foreground">No examples available.</div>;

  return (
    <div className="grid gap-3 max-h-[300px] overflow-y-auto">
      {examples.map((ex) => (
        <button key={ex.id} className="text-left w-full p-4 rounded-2xl bg-muted/40 hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20 flex flex-col gap-2" onClick={() => onSelect(ex)}>
          <div className="flex justify-between items-center w-full">
            <h3 className="font-bold text-foreground text-lg">{ex.title}</h3>
            <span className="text-xs font-bold bg-white px-2 py-1 rounded-full border">{ex.fields.length}</span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{ex.instructions}</p>
        </button>
      ))}
    </div>
  );
}

function FormPreview({ schema, values, onValueChange }: { 
  schema: FormSchema, 
  values: FieldValue[],
  onValueChange: (id: string, val: string) => void 
}) {
  return (
    <div className="p-4 md:p-8 space-y-4">
      {schema.fields.map((field) => {
        const valEntry = values.find(v => v.fieldId === field.id);
        const valString = valEntry?.value as string || "";
        const isFilled = !!valString;

        return (
          <div key={field.id} className={cn(
            "p-5 rounded-2xl transition-all",
            isFilled ? "bg-white border shadow-sm" : "bg-muted/50 border border-dashed"
          )}>
            <label className="block text-sm font-bold mb-2 text-foreground">
              {field.label}
              {field.required === 'required' && <span className="text-destructive ml-1">*</span>}
            </label>
            
            {field.type === 'multiline' ? (
              <Textarea 
                value={valString}
                onChange={(e) => onValueChange(field.id, e.target.value)}
                placeholder="..."
                className={cn(
                  "resize-none min-h-[80px] text-base bg-background shadow-inner border-none rounded-xl focus-visible:ring-2 focus-visible:ring-primary font-medium", 
                  !isFilled && "opacity-70"
                )}
              />
            ) : (
              <Input 
                value={valString}
                onChange={(e) => onValueChange(field.id, e.target.value)}
                placeholder="..."
                className={cn(
                  "h-12 text-base bg-background shadow-inner border-none rounded-xl focus-visible:ring-2 focus-visible:ring-primary font-medium", 
                  !isFilled && "opacity-70"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}