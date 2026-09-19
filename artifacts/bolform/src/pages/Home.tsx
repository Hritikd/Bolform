import { useState, useRef } from "react";
import { UploadCloud, FileText, Bot, Languages, ArrowRight, Save, CheckCircle2, RotateCcw, AlertCircle, ArrowLeft, PauseCircle, Play } from "lucide-react";
import { useGetBolformStatus, useGetBolformExamples, useParseFormText, useProcessConversationTurn, useSynthesizeSpeech } from "@workspace/api-client-react";
import { useImportForm, useTranscribeAudio, useExportForm } from "../hooks/use-manual-apis";
import type { FormSchema, FieldValue, ConversationInputLanguage, FieldPatch } from "@workspace/api-client-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardFooter } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { useAudioRecorder } from "../hooks/use-audio-recorder";
import { VoiceOrb, type VoiceState } from "../components/voice-orb";
import { cn } from "../lib/utils";

type SessionState = "setup" | "orientation" | "workspace" | "review";

export default function Home() {
  const { data: status, isLoading: isStatusLoading } = useGetBolformStatus();
  
  const [sessionState, setSessionState] = useState<SessionState>("setup");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [language, setLanguage] = useState<ConversationInputLanguage>("hi-IN");
  
  const [activeSchema, setActiveSchema] = useState<FormSchema | null>(null);
  const [fieldValues, setFieldValues] = useState<FieldValue[]>([]);
  
  // Workspace state
  const [currentTurnId, setCurrentTurnId] = useState<string>("init");
  const [turnRevision, setTurnRevision] = useState<number>(0);
  
  // History stack for Undo
  const historyStack = useRef<Array<{
    turnId: string, 
    revision: number,
    question: string,
    values: FieldValue[]
  }>>([]);

  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [assistantAudioBase64, setAssistantAudioBase64] = useState<string | null>(null);
  const [typedReply, setTypedReply] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");
  const [mobileTab, setMobileTab] = useState<"agent" | "form">("agent");

  const processTurnMutation = useProcessConversationTurn();
  const synthesizeMutation = useSynthesizeSpeech();
  const transcribeMutation = useTranscribeAudio();
  const parseTextMutation = useParseFormText();
  const importFileMutation = useImportForm();
  const exportFormMutation = useExportForm();

  const [pasteText, setPasteText] = useState("");
  const activeRequest = useRef(0);
  const [sourcePreview, setSourcePreview] = useState<{ url: string; mime: string } | null>(null);

  const { isRecording, startRecording, stopRecording } = useAudioRecorder(
    async (blob) => {
      setVoiceState("understanding");
      try {
        const res = await transcribeMutation.mutateAsync({ blob, language });
        if (res.text) {
          setLastTranscript(res.text);
          processUserTurn(res.text);
        } else {
          setVoiceError("I didn't catch that. Tap the orb to try again.");
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
          ? "Microphone permission was denied. Allow access in your browser settings, or type your answer."
          : err.name === "NotFoundError"
            ? "No microphone was found. Connect one or type your answer."
            : "The microphone is unavailable. Try again or type your answer."
      );
      setVoiceState("error");
    }
  );

  if (isStatusLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-medium text-lg flex items-center gap-3">
          <Bot className="w-6 h-6" /> Checking provider status...
        </div>
      </div>
    );
  }

  const isBlocked = status && (status.chat === 'blocked' || status.speech === 'blocked' || status.transcription === 'blocked' || status.documentAi === 'blocked');
  if (isBlocked) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full border-destructive/20 shadow-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Service Unavailable</h2>
          <p className="text-destructive font-medium mb-4">{status.message || "Required AI providers are not fully configured or are blocked."}</p>
          <p className="text-sm text-muted-foreground">
            Please check your API keys for Document AI, LLM Chat, and Speech models.
          </p>
        </Card>
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
    setMobileTab("agent");
  };

  const startVoiceSession = async () => {
    setSessionState("workspace");
    if (!activeSchema) return;
    const requiredCount = activeSchema.fields.filter((field) => field.required === "required").length;
    const detailNames = activeSchema.fields.slice(0, 4).map((field) => field.label).join(", ");
    const initialQuestion = language === "hi-IN"
      ? `नमस्ते। यह ${activeSchema.title} फ़ॉर्म है। इसमें ${requiredCount || activeSchema.fields.length} ज़रूरी जानकारियाँ चाहिए, जैसे ${detailNames}। हम एक-एक करके सारी जानकारी भरेंगे। पहले अपना जवाब बताइए।`
      : `Hello. This is the ${activeSchema.title} form. It asks for ${requiredCount || activeSchema.fields.length} required details, including ${detailNames}. Let's go one at a time and fill everything together. Tell me your first answer when you're ready.`;
    setCurrentQuestion(initialQuestion);
    await playAssistantSpeech(initialQuestion);
  };

  const playAssistantSpeech = async (text: string) => {
    setVoiceState("understanding"); // Show processing while synthesizing
    try {
      const result = await synthesizeMutation.mutateAsync({ data: { text, language } });
      setAssistantAudioBase64(result.audioBase64);
      setVoiceState("speaking");
    } catch (err) {
      console.error("Failed to synthesize speech:", err);
      setVoiceError("Failed to synthesize speech.");
      setVoiceState("error");
    }
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
    setAssistantAudioBase64(null);
    setVoiceState("paused");
    setVoiceError(null);
  };

  const handleOrbClick = () => {
    if (voiceState === 'listening') {
      stopRecording();
    } else if (voiceState === 'idle' || voiceState === 'paused' || voiceState === 'error') {
      startRecordingWrapper();
    } else if (voiceState === 'speaking') {
      setAssistantAudioBase64(null);
      setVoiceState('paused');
    }
  };

  const submitTypedReply = (text: string) => {
    if (!text.trim()) return;
    if (voiceState === 'listening') {
      stopRecording(true); // Cancel without transcription
    }
    setAssistantAudioBase64(null);
    setTypedReply("");
    setLastTranscript(text);
    processUserTurn(text);
  };

  const processUserTurn = async (text: string) => {
    if (!activeSchema) return;
    setVoiceState("understanding");
    setVoiceError(null);
    
    // Save state to stack before mutating
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
      const lastState = historyStack.current.pop();
      if (lastState) {
        // Rollback state if turn fails but don't revert UI question immediately
        // Just show error
      }
      setVoiceError("I couldn't process that. Please try again.");
      setVoiceState("error");
    }
  };

  const handleUndo = () => {
    activeRequest.current += 1;
    const lastState = historyStack.current.pop();
    if (lastState) {
      if (voiceState === 'listening') stopRecording(true);
      setAssistantAudioBase64(null);
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
    setAssistantAudioBase64(null);
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

  const pauseAndReset = () => {
    if (isRecording) stopRecording(true);
    setAssistantAudioBase64(null);
    setVoiceState("idle");
    setSessionState("setup");
  };

  return (
    <div className="h-[100dvh] bg-background text-foreground flex flex-col font-sans overflow-hidden">
      {sessionState === "setup" && (
        <div className="w-full max-w-5xl mx-auto p-6 md:p-12 h-full overflow-y-auto flex flex-col justify-center">
          <div className="mb-14 text-center space-y-6">
            <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-3xl mb-2">
              <Bot className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">BolForm Voice Agent</h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
              A patient, voice-first agent that helps you navigate and complete forms in your preferred language.
            </p>
            <div className="flex justify-center mt-6">
              <div className="inline-flex items-center bg-card p-1.5 rounded-full shadow-sm border">
                <Button 
                  variant={language === "hi-IN" ? "default" : "ghost"} 
                  onClick={() => setLanguage("hi-IN")}
                  className="rounded-full px-8 font-medium text-base h-12"
                >
                  <Languages className="w-5 h-5 mr-2" /> हिन्दी
                </Button>
                <Button 
                  variant={language === "en-IN" ? "default" : "ghost"} 
                  onClick={() => setLanguage("en-IN")}
                  className="rounded-full px-8 font-medium text-base h-12"
                >
                  English
                </Button>
              </div>
            </div>
          </div>

          <Tabs defaultValue="upload" className="w-full max-w-3xl mx-auto">
            <TabsList className="grid w-full grid-cols-3 mb-8 p-1.5 bg-muted/60 border rounded-2xl h-16">
              <TabsTrigger value="upload" className="rounded-xl font-semibold text-base">Upload File</TabsTrigger>
              <TabsTrigger value="paste" className="rounded-xl font-semibold text-base">Paste Text</TabsTrigger>
              <TabsTrigger value="examples" className="rounded-xl font-semibold text-base">Examples</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="focus:outline-none">
              <Card className="border-dashed border-2 bg-transparent hover:bg-card/50 transition-colors shadow-none h-72 flex flex-col">
                <CardContent className="flex flex-col items-center justify-center text-center flex-1 p-8">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <UploadCloud className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-xl mb-2">Upload a Form</h3>
                  <p className="text-base text-muted-foreground mb-8 max-w-sm">
                    Scan a PDF or image of your form up to 10MB.
                  </p>
                  <label className="cursor-pointer">
                    <Button asChild size="lg" className="rounded-full px-10 h-14 text-base shadow-md">
                      <span>{importFileMutation.isPending ? "Reading Form..." : "Choose File"}</span>
                    </Button>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".pdf,.png,.jpg,.jpeg"
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="paste" className="focus:outline-none">
              <Card className="border shadow-sm bg-card">
                <CardContent className="p-6">
                  <Textarea 
                    placeholder="Paste form text here..." 
                    className="min-h-[220px] resize-none text-base p-6 bg-background rounded-xl border-input shadow-inner focus-visible:ring-primary mb-4"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button 
                      size="lg"
                      className="rounded-full px-10 h-14 text-base shadow-md"
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
                      {parseTextMutation.isPending ? "Extracting Fields..." : "Process Text"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="examples" className="focus:outline-none">
              <ExamplesList onSelect={(schema) => initSession(schema, { url: `/api/bolform/examples/${schema.id}/pdf?preview=1`, mime: "application/pdf" })} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {sessionState === "orientation" && activeSchema && (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] p-8 text-center bg-slate-900 text-white animate-in fade-in zoom-in-95 duration-500">
          <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(20,184,166,0.15)]">
            <FileText className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">{activeSchema.title}</h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl leading-relaxed">{activeSchema.instructions || "Let's fill this out together."}</p>
          
          <div className="bg-slate-800/80 rounded-3xl p-8 mb-12 max-w-md w-full border border-slate-700/50 backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-700/50">
              <span className="text-slate-400 font-medium">Total Fields to Complete</span>
              <span className="font-bold text-2xl text-primary">{activeSchema.fields.length}</span>
            </div>
            <div className="text-left text-slate-300 text-base leading-relaxed space-y-4">
              <p>I will guide you through this form one step at a time.</p>
              <p>You can speak naturally, and I will extract the required details.</p>
            </div>
          </div>

          <Button 
            size="lg" 
            className="h-16 px-12 text-xl rounded-full shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)] transition-all font-semibold" 
            onClick={startVoiceSession}
          >
            Start Voice Session
          </Button>
        </div>
      )}

      {sessionState === "workspace" && activeSchema && (
        <div className="flex flex-col md:flex-row h-full w-full overflow-hidden animate-in fade-in duration-500">
          
          {/* Mobile Tabs Switcher */}
          <div className="md:hidden shrink-0 bg-slate-900 px-4 pt-6 pb-3">
            <div className="flex bg-slate-800 rounded-xl p-1 gap-1 border border-slate-700/50">
              <button 
                className={cn("flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all", mobileTab === 'agent' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400")}
                onClick={() => setMobileTab('agent')}
              >
                Assistant
              </button>
              <button 
                className={cn("flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2", mobileTab === 'form' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400")}
                onClick={() => setMobileTab('form')}
              >
                Form <span className="bg-primary/20 text-primary-foreground px-2 py-0.5 rounded-full text-xs">{fieldValues.length}/{activeSchema.fields.length}</span>
              </button>
            </div>
          </div>

          {/* Voice Panel */}
          <div className={cn(
            "w-full md:w-[45%] lg:w-[40%] flex flex-col bg-slate-900 text-slate-50 relative shrink-0 transition-all z-10 shadow-2xl",
            mobileTab !== 'agent' ? "hidden md:flex" : "flex flex-1 md:flex-none"
          )}>
            <div className="p-4 md:p-6 flex justify-between items-center shrink-0 w-full border-b border-slate-800/80">
              <Button variant="ghost" size="icon" onClick={pauseAndReset} className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={voiceState === "paused" ? startRecordingWrapper : pauseVoiceSession}
                  disabled={voiceState === "understanding"}
                  className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-full px-4 font-medium"
                >
                  {voiceState === "paused" ? <Play className="w-4 h-4 mr-2" /> : <PauseCircle className="w-4 h-4 mr-2" />}
                  {voiceState === "paused" ? "Resume" : "Pause"}
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleUndo} 
                  disabled={historyStack.current.length === 0 || voiceState === 'understanding'}
                  className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-full px-4 font-medium"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> Undo
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => setSessionState("review")}
                  className="bg-primary/20 text-primary-foreground hover:bg-primary/30 border-none rounded-full px-5 font-semibold"
                >
                  Review <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-12 overflow-y-auto">
              <div className="w-full flex justify-center">
                 <VoiceOrb 
                   state={voiceState} 
                   audioBase64={assistantAudioBase64} 
                   onAudioEnded={handleAssistantAudioEnded} 
                   onClick={handleOrbClick}
                 />
              </div>

              <div className="text-center w-full max-w-sm space-y-4">
                {voiceState === 'error' ? (
                  <div className="text-destructive-foreground bg-destructive/90 p-4 rounded-2xl shadow-lg font-medium animate-in slide-in-from-bottom-2">
                    {voiceError || "An error occurred."}
                  </div>
                ) : (
                  <h2 className="text-2xl md:text-3xl font-medium leading-snug tracking-tight text-white animate-in fade-in slide-in-from-bottom-2">
                    {currentQuestion}
                  </h2>
                )}
                
                <div className="h-6 flex items-center justify-center mt-4">
                  {voiceState === 'listening' && <p className="text-slate-400 animate-pulse text-sm font-medium">Listening... Tap orb when done.</p>}
                  {voiceState === 'understanding' && <p className="text-slate-400 animate-pulse text-sm font-medium">Understanding...</p>}
                  {voiceState === 'paused' && <p className="text-slate-400 text-sm font-medium">Paused. Tap orb to resume.</p>}
                  {voiceState === 'idle' && !voiceError && <p className="text-slate-400 text-sm font-medium">Ready. Tap orb to speak.</p>}
                </div>
                {lastTranscript && (
                  <p className="text-sm text-slate-300 bg-slate-800/80 border border-slate-700/60 rounded-2xl px-4 py-3">
                    <span className="text-slate-500">I heard: </span>{lastTranscript}
                  </p>
                )}
              </div>
            </div>
            
            <div className="p-4 md:p-6 bg-slate-900 border-t border-slate-800 shrink-0">
              <div className="flex gap-3 max-w-lg mx-auto w-full">
                <Input 
                  placeholder="Or type your answer..." 
                  value={typedReply}
                  onChange={(e) => setTypedReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitTypedReply(typedReply);
                  }}
                  disabled={voiceState === 'understanding'}
                  className="h-14 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-2xl focus-visible:ring-primary shadow-inner text-base px-5"
                />
                <Button 
                  size="lg"
                  onClick={() => submitTypedReply(typedReply)}
                  disabled={!typedReply.trim() || voiceState === 'understanding'}
                  className="h-14 px-8 rounded-2xl font-semibold shadow-md"
                >
                  Send
                </Button>
              </div>
            </div>
          </div>

          {/* Form Panel */}
          <div className={cn(
            "w-full md:flex-1 flex flex-col bg-background min-w-0 transition-all",
            mobileTab !== 'form' ? "hidden md:flex" : "flex flex-1 md:flex-none"
          )}>
            <div className="px-6 md:px-8 py-5 border-b bg-card flex items-center justify-between shrink-0 shadow-sm z-10">
              <h3 className="font-semibold text-lg flex items-center gap-3 text-foreground">
                 <FileText className="w-5 h-5 text-muted-foreground" /> {activeSchema.title}
              </h3>
              <div className="text-sm font-semibold text-primary bg-primary/10 px-4 py-1.5 rounded-full hidden md:block">
                 {fieldValues.length} / {activeSchema.fields.length} filled
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col bg-muted/20 relative">
              <Tabs defaultValue="form" className="flex flex-1 min-h-0 flex-col">
                {sourcePreview && (
                  <div className="px-6 py-3 bg-card border-b shrink-0 flex justify-center">
                    <TabsList className="bg-muted">
                      <TabsTrigger value="form" className="rounded-lg px-6 font-medium">Live Answers</TabsTrigger>
                      <TabsTrigger value="original" className="rounded-lg px-6 font-medium">Original Document</TabsTrigger>
                    </TabsList>
                  </div>
                )}
                <TabsContent value="form" className="flex-1 min-h-0 mt-0 data-[state=active]:flex flex-col">
                   <FormPreview schema={activeSchema} values={fieldValues} onValueChange={handleManualValueChange} />
                </TabsContent>
                {sourcePreview && (
                  <TabsContent value="original" className="flex-1 min-h-0 mt-0 p-6 data-[state=active]:flex flex-col">
                    {sourcePreview.mime.startsWith("image/") ? (
                      <img src={sourcePreview.url} alt="Original form" className="w-full h-full object-contain rounded-2xl bg-card border shadow-sm" />
                    ) : (
                      <iframe src={sourcePreview.url} title="Original form preview" className="w-full h-full rounded-2xl border bg-card shadow-sm" />
                    )}
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </div>

        </div>
      )}

      {sessionState === "review" && activeSchema && (
        <div className="w-full max-w-4xl mx-auto p-6 md:p-12 h-full overflow-y-auto animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Review Your Form</h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-lg mx-auto">
              Please check your answers. You can make final edits before exporting the PDF.
            </p>
          </div>
          
          <Card className="shadow-lg border-border bg-card overflow-hidden mb-10 rounded-3xl">
            <div className="max-h-[50dvh] overflow-y-auto bg-card">
              <FormPreview 
                schema={activeSchema} 
                values={fieldValues} 
                onValueChange={handleManualValueChange}
              />
            </div>
          </Card>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button variant="outline" size="lg" className="rounded-full px-10 h-14 text-base font-semibold" onClick={() => setSessionState("workspace")}>
              Back to Assistant
            </Button>
            <Button 
              size="lg" 
              className="rounded-full px-10 h-14 text-base shadow-md font-semibold" 
              onClick={handleExport} 
              disabled={exportFormMutation.isPending}
            >
              <Save className="w-5 h-5 mr-2.5" />
              {exportFormMutation.isPending ? "Exporting PDF..." : "Export as PDF"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExamplesList({ onSelect }: { onSelect: (schema: FormSchema) => void }) {
  const { data: examples, isLoading } = useGetBolformExamples();
  
  if (isLoading) return <div className="text-center py-20 text-muted-foreground animate-pulse text-lg font-medium">Loading examples...</div>;
  if (!examples?.length) return <div className="text-center py-20 text-muted-foreground text-lg">No examples available right now.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto p-1">
      {examples.map((ex) => (
        <Card key={ex.id} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group overflow-hidden bg-card border-border rounded-2xl" onClick={() => onSelect(ex)}>
          <CardContent className="p-6">
            <div className="flex justify-between items-start gap-4 mb-4">
              <h3 className="font-semibold text-lg leading-snug group-hover:text-primary transition-colors">{ex.title}</h3>
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed mb-6">{ex.instructions}</p>
            <div className="flex items-center justify-between mt-auto">
              <Badge variant="secondary" className="font-medium bg-muted/80 text-foreground px-3 py-1 rounded-full">
                {ex.fields.length} fields
              </Badge>
              <a
                href={`/api/bolform/examples/${ex.id}/pdf`}
                download
                onClick={(event) => event.stopPropagation()}
                className="text-sm font-semibold text-primary hover:underline underline-offset-4 focus:outline-none"
              >
                View Blank PDF
              </a>
            </div>
          </CardContent>
        </Card>
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
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-transparent">
      {schema.fields.map((field) => {
        const valEntry = values.find(v => v.fieldId === field.id);
        const valString = valEntry?.value as string || "";
        const isFilled = !!valString;

        return (
          <div key={field.id} className={cn(
            "p-5 md:p-6 rounded-2xl transition-all border",
            isFilled ? "bg-card border-border shadow-sm" : "bg-muted/40 border-dashed border-border/70 hover:bg-muted/60"
          )}>
            <label className="block text-sm font-semibold mb-1.5 text-foreground">
              {field.label}
              {field.required === 'required' && <span className="text-destructive ml-1.5">*</span>}
            </label>
            {field.instructions && (
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed max-w-[90%]">{field.instructions}</p>
            )}
            
            {field.type === 'multiline' ? (
              <Textarea 
                value={valString}
                onChange={(e) => onValueChange(field.id, e.target.value)}
                placeholder="Awaiting answer..."
                className={cn(
                  "resize-none min-h-[100px] text-base bg-background shadow-none border-input rounded-xl focus-visible:ring-primary", 
                  !isFilled && "opacity-70"
                )}
              />
            ) : (
              <Input 
                value={valString}
                onChange={(e) => onValueChange(field.id, e.target.value)}
                placeholder="Awaiting answer..."
                className={cn(
                  "h-12 text-base bg-background shadow-none border-input rounded-xl focus-visible:ring-primary", 
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
