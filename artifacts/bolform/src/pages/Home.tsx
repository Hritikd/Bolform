import { useState, useRef, useEffect } from "react";
import { Mic, Square, UploadCloud, FileText, Bot, Languages, ArrowRight, Save, CheckCircle2, Play, CircleAlert, RotateCcw } from "lucide-react";
import { useGetBolformStatus, useGetBolformExamples, useParseFormText, useProcessConversationTurn, useSynthesizeSpeech } from "@workspace/api-client-react";
import { useImportForm, useTranscribeAudio, useExportForm } from "../hooks/use-manual-apis";
import type { FormSchema, FieldValue, ConversationInputLanguage, FieldPatch } from "@workspace/api-client-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { useAudioRecorder } from "../hooks/use-audio-recorder";
import { AudioPlayerWaveform } from "../components/audio-player-waveform";

type SessionState = "setup" | "workspace" | "review";

export default function Home() {
  const { data: status, isLoading: isStatusLoading } = useGetBolformStatus();
  
  const [sessionState, setSessionState] = useState<SessionState>("setup");
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
    values: FieldValue[],
    chat: Array<{ role: 'assistant' | 'user', text: string }>
  }>>([]);

  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'assistant' | 'user', text: string }>>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [assistantAudioBase64, setAssistantAudioBase64] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [typedReply, setTypedReply] = useState("");

  const processTurnMutation = useProcessConversationTurn();
  const synthesizeMutation = useSynthesizeSpeech();
  const transcribeMutation = useTranscribeAudio();
  const parseTextMutation = useParseFormText();
  const importFileMutation = useImportForm();
  const exportFormMutation = useExportForm();

  const [pasteText, setPasteText] = useState("");
  const activeRequest = useRef(0);
  const [sourcePreview, setSourcePreview] = useState<{ url: string; mime: string } | null>(null);

  const { isRecording, startRecording, stopRecording, timeLeft } = useAudioRecorder(async (blob) => {
    try {
      const res = await transcribeMutation.mutateAsync({ blob, language });
      if (res.text) {
        handleUserReply(res.text);
      }
    } catch (err) {
      console.error("Transcription failed", err);
    }
  });

  if (isStatusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Checking provider status...</div>
      </div>
    );
  }

  const isBlocked = status && (status.chat === 'blocked' || status.speech === 'blocked' || status.transcription === 'blocked' || status.documentAi === 'blocked');
  if (isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full border-destructive/20 shadow-lg">
          <CardHeader className="text-center pb-2">
            <CircleAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
            <CardTitle className="text-xl">Service Unavailable</CardTitle>
            <CardDescription className="text-destructive font-medium mt-2">{status.message || "Required AI providers are not fully configured or are blocked."}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-center text-muted-foreground">
            Please check your API keys for Document AI, LLM Chat, and Speech models.
          </CardContent>
        </Card>
      </div>
    );
  }

  const startConversation = async (schema: FormSchema, preview?: { url: string; mime: string }) => {
    const initialValues: FieldValue[] = [];
    setActiveSchema(schema);
    setFieldValues(initialValues);
    setSessionState("workspace");
    setConversationHistory([]);
    historyStack.current = [];
    setSourcePreview(preview ?? null);
    
    const initialQuestion = language === "hi-IN"
      ? "नमस्ते। आप इस फ़ॉर्म के लिए जो जानकारी जानते हैं, बता दीजिए। बाकी मैं पूछ लूँगी।"
      : "Hello. Tell me what you already know for this form, and I’ll ask for the rest.";
    setCurrentQuestion(initialQuestion);
    setCurrentTurnId("init");
    setTurnRevision(0);

    await playAssistantSpeech(initialQuestion);
  };

  const playAssistantSpeech = async (text: string) => {
    setIsSynthesizing(true);
    try {
      const result = await synthesizeMutation.mutateAsync({ data: { text, language } });
      setAssistantAudioBase64(result.audioBase64);
      setIsPlayingAudio(true);
    } catch (err) {
      console.error("Failed to synthesize speech:", err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleUserReply = async (text: string) => {
    if (!text.trim() || !activeSchema) return;
    
    // Save state to stack before mutating
    historyStack.current.push({
      turnId: currentTurnId,
      revision: turnRevision,
      question: currentQuestion,
      values: [...fieldValues],
      chat: [...conversationHistory]
    });

    const newChat = [...conversationHistory, { role: 'user' as const, text }];
    setConversationHistory(newChat);
    setTypedReply("");
    
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
      setConversationHistory(prev => [...prev, { role: 'assistant', text: res.reply }]);
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
      // rollback on error
      const lastState = historyStack.current.pop();
      if (lastState) {
        setConversationHistory(lastState.chat);
      }
    }
  };

  const handleUndo = () => {
    activeRequest.current += 1;
    const lastState = historyStack.current.pop();
    if (lastState) {
      setCurrentTurnId(lastState.turnId);
      setTurnRevision(lastState.revision);
      setCurrentQuestion(lastState.question);
      setFieldValues(lastState.values);
      setConversationHistory(lastState.chat);
      setAssistantAudioBase64(null);
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
    setIsPlayingAudio(false);
    setAssistantAudioBase64(null);
    setActiveSchema(null);
    setFieldValues([]);
    setConversationHistory([]);
    setCurrentQuestion("");
    setTypedReply("");
    setPasteText("");
    if (sourcePreview?.url.startsWith("blob:")) URL.revokeObjectURL(sourcePreview.url);
    setSourcePreview(null);
    historyStack.current = [];
    setSessionState("setup");
  };

  return (
    <div className="h-[100dvh] bg-background text-foreground flex flex-col font-sans">
      <header className="px-6 py-4 border-b bg-card flex justify-between items-center shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 text-primary">
          <Bot className="w-7 h-7" />
          <span className="font-bold text-xl tracking-tight">BolForm</span>
        </div>
        {sessionState !== "setup" && (
          <Button variant="outline" size="sm" onClick={resetSession} className="border-border">
            Reset
          </Button>
        )}
      </header>

      <main className="flex-1 overflow-hidden">
        {sessionState === "setup" && (
          <div className="w-full max-w-4xl mx-auto p-6 md:p-12 h-full overflow-y-auto">
            <div className="mb-10 text-center space-y-4">
               <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-card-foreground">Your words. Your language. Your form, filled.</h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                A patient, voice-guided assistant to help you understand and complete English forms in your preferred language.
              </p>
               <p className="text-primary text-xl font-semibold" lang="hi">आप बोलिए, फ़ॉर्म हम भरेंगे।</p>
            </div>

            <div className="flex justify-center mb-10">
              <div className="inline-flex items-center bg-card p-1 rounded-xl border shadow-sm">
                <Button 
                  variant={language === "hi-IN" ? "default" : "ghost"} 
                  onClick={() => setLanguage("hi-IN")}
                  className="rounded-lg px-6"
                >
                   <Languages className="w-4 h-4 mr-2" /> हिन्दी
                </Button>
                <Button 
                  variant={language === "en-IN" ? "default" : "ghost"} 
                  onClick={() => setLanguage("en-IN")}
                  className="rounded-lg px-6"
                >
                   English
                </Button>
              </div>
            </div>

            <Tabs defaultValue="upload" className="w-full max-w-2xl mx-auto">
              <TabsList className="grid w-full grid-cols-3 mb-6 p-1 bg-card border">
                <TabsTrigger value="upload" className="rounded-lg">Upload File</TabsTrigger>
                <TabsTrigger value="paste" className="rounded-lg">Paste Text</TabsTrigger>
                <TabsTrigger value="examples" className="rounded-lg">Examples</TabsTrigger>
              </TabsList>
              
              <TabsContent value="upload" className="focus:outline-none">
                <Card className="border-dashed border-2 bg-card/40 hover:bg-card/80 transition-colors">
                  <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <UploadCloud className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Upload a Form</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                      Upload a scanned PDF, PNG, or JPEG of your form up to 10MB, and we'll guide you through it.
                    </p>
                    <label className="cursor-pointer">
                      <Button asChild size="lg" className="rounded-xl px-8">
                        <span>
                          {importFileMutation.isPending ? "Reading Form..." : "Choose File"}
                        </span>
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
                              startConversation(schema, { url: URL.createObjectURL(file), mime: file.type });
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
                <Card className="border shadow-sm">
                  <CardHeader>
                    <CardTitle>Paste Form Content</CardTitle>
                    <CardDescription>If you have plain text of the form, paste it here.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea 
                      placeholder="Paste form text here..." 
                      className="min-h-[240px] resize-none text-base p-4 bg-background"
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                    />
                  </CardContent>
                  <CardFooter className="justify-end bg-muted/20 border-t p-4">
                    <Button 
                      size="lg"
                      disabled={!pasteText.trim() || parseTextMutation.isPending}
                      onClick={async () => {
                        try {
                          const schema = await parseTextMutation.mutateAsync({ data: { text: pasteText } });
                          startConversation(schema);
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                    >
                      {parseTextMutation.isPending ? "Extracting Fields..." : "Start Guided Process"}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>

              <TabsContent value="examples" className="focus:outline-none">
                <ExamplesList onSelect={(schema) => startConversation(schema, { url: `/api/bolform/examples/${schema.id}/pdf`, mime: "application/pdf" })} />
              </TabsContent>
            </Tabs>
            <p className="max-w-2xl mx-auto mt-6 text-xs leading-relaxed text-muted-foreground text-center">
              Your speech and uploaded form are processed by Sarvam AI. BolForm keeps this session in memory and does not save an answer history. Nothing is submitted to an institution.
            </p>
          </div>
        )}

        {sessionState === "workspace" && activeSchema && (
          <div className="flex flex-col md:flex-row w-full h-full">
            {/* Left: Chat workspace */}
            <div className="w-full md:w-1/2 flex flex-col border-r border-border h-full bg-background relative">
              <div className="px-6 py-4 border-b border-border bg-card shrink-0 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-lg text-card-foreground">{activeSchema.title || "Form Assistant"}</h2>
                  <p className="text-sm text-muted-foreground">{activeSchema.fields.length} fields to complete</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleUndo}
                    disabled={historyStack.current.length === 0 || processTurnMutation.isPending}
                    className="text-muted-foreground hover:text-foreground"
                    title="Undo last message"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setSessionState("review")}>
                    Skip to Review <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-card/30">
                {conversationHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm text-base ${
                      msg.role === 'assistant' 
                        ? 'bg-card text-card-foreground border border-border' 
                        : 'bg-primary text-primary-foreground font-medium'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                
                {/* Assistant Current State */}
                <div className="flex justify-start">
                  <div className="w-full max-w-[90%] rounded-2xl p-5 bg-accent/20 border border-accent/30 shadow-sm">
                    <p className="text-card-foreground font-medium text-lg leading-relaxed mb-4">{currentQuestion}</p>
                    
                    <div className="bg-card rounded-xl p-3 min-h-[4.5rem] flex items-center border border-border/50 shadow-inner">
                      {isSynthesizing ? (
                        <div className="w-full text-center text-sm text-muted-foreground animate-pulse">Synthesizing voice...</div>
                      ) : assistantAudioBase64 ? (
                        <div className="w-full flex items-center gap-3">
                          <Button 
                            size="icon" 
                            className="shrink-0 rounded-full w-10 h-10 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                            onClick={() => setIsPlayingAudio(true)}
                            disabled={isPlayingAudio}
                          >
                            <Play className="w-5 h-5 ml-1" />
                          </Button>
                          <div className="flex-1 relative">
                            <AudioPlayerWaveform 
                              audioBase64={assistantAudioBase64} 
                              isPlaying={isPlayingAudio} 
                              onEnded={() => setIsPlayingAudio(false)} 
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {processTurnMutation.isPending && (
                  <div className="text-center text-sm text-muted-foreground py-4 animate-pulse flex items-center justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce delay-75" />
                    <div className="w-2 h-2 rounded-full bg-primary/80 animate-bounce delay-150" />
                  </div>
                )}
                {/* Invisible element to auto-scroll */}
                <div className="h-4"></div>
              </div>

              <div className="p-4 bg-card border-t border-border shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                <div className="flex gap-3">
                  <Input 
                    placeholder="Type your answer here..." 
                    value={typedReply}
                    onChange={(e) => setTypedReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUserReply(typedReply);
                    }}
                    disabled={isRecording || processTurnMutation.isPending}
                    className="h-14 rounded-xl text-base bg-background"
                  />
                  {!isRecording && typedReply.trim() ? (
                    <Button 
                      size="lg"
                      className="shrink-0 h-14 px-8 rounded-xl font-semibold"
                      onClick={() => handleUserReply(typedReply)} 
                      disabled={processTurnMutation.isPending}
                    >
                      Send
                    </Button>
                  ) : (
                    <Button 
                      size="lg"
                      variant={isRecording ? "destructive" : "default"} 
                      className="shrink-0 h-14 w-14 rounded-xl transition-all relative overflow-hidden p-0"
                      onClick={() => {
                        if (isRecording) stopRecording();
                        else startRecording();
                      }}
                      disabled={processTurnMutation.isPending}
                    >
                      {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                      {isRecording && (
                        <div className="absolute inset-0 bg-destructive/10 animate-pulse" />
                      )}
                    </Button>
                  )}
                </div>
                {isRecording && (
                  <div className="text-sm text-destructive text-center mt-3 font-medium flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    Recording in progress... {timeLeft}s remaining
                  </div>
                )}
              </div>
            </div>

            {/* Right: Form Preview */}
            <div className="hidden md:flex w-1/2 flex-col h-full bg-muted/30">
              <Tabs defaultValue="form" className="flex flex-1 min-h-0 flex-col">
                <div className="px-6 py-3 border-b border-border bg-muted/10 shrink-0 flex items-center justify-between">
                  <h3 className="font-semibold text-lg text-card-foreground flex items-center gap-2">
                    <FileText className="w-5 h-5 text-muted-foreground" /> Form
                  </h3>
                  {sourcePreview && (
                    <TabsList>
                      <TabsTrigger value="form">Answers</TabsTrigger>
                      <TabsTrigger value="original">Original</TabsTrigger>
                    </TabsList>
                  )}
                </div>
                <TabsContent value="form" className="flex-1 min-h-0 mt-0">
                  <FormPreview schema={activeSchema} values={fieldValues} onValueChange={handleManualValueChange} />
                </TabsContent>
                {sourcePreview && (
                  <TabsContent value="original" className="flex-1 min-h-0 mt-0 p-4">
                    {sourcePreview.mime.startsWith("image/") ? (
                      <img src={sourcePreview.url} alt="Original uploaded form" className="w-full h-full object-contain rounded-xl bg-card" />
                    ) : (
                      <iframe src={sourcePreview.url} title="Original form preview" className="w-full h-full rounded-xl border bg-card" />
                    )}
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </div>
        )}

        {sessionState === "review" && activeSchema && (
          <div className="w-full max-w-4xl mx-auto p-6 md:p-12 h-full overflow-y-auto">
            <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-primary" /> Review Form
                </h1>
                <p className="text-muted-foreground mt-2 text-lg">
                  Check your answers below. You can make final edits before saving.
                </p>
              </div>
              <Button 
                size="lg" 
                onClick={handleExport} 
                disabled={exportFormMutation.isPending}
                className="gap-2 rounded-xl px-8 shrink-0 shadow-md"
              >
                <Save className="w-5 h-5" />
                {exportFormMutation.isPending ? "Exporting PDF..." : "Export as PDF"}
              </Button>
            </div>
            
            <Card className="shadow-lg border-primary/10 bg-card overflow-hidden">
              <div className="h-[calc(100dvh-250px)] overflow-y-auto bg-card">
                <FormPreview 
                  schema={activeSchema} 
                  values={fieldValues} 
                  onValueChange={handleManualValueChange}
                />
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function ExamplesList({ onSelect }: { onSelect: (schema: FormSchema) => void }) {
  const { data: examples, isLoading } = useGetBolformExamples();
  
  if (isLoading) return <div className="text-center py-20 text-muted-foreground animate-pulse text-lg">Loading examples...</div>;
  if (!examples?.length) return <div className="text-center py-20 text-muted-foreground text-lg">No examples available right now.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {examples.map((ex) => (
        <Card key={ex.id} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group overflow-hidden" onClick={() => onSelect(ex)}>
          <CardHeader className="bg-card">
            <div className="flex justify-between items-start gap-4">
              <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">{ex.title}</CardTitle>
              <FileText className="w-6 h-6 text-muted-foreground shrink-0" />
            </div>
            <CardDescription className="line-clamp-2 text-sm mt-2">{ex.instructions}</CardDescription>
          </CardHeader>
          <CardFooter className="bg-muted/10 border-t pt-4 flex items-center justify-between gap-3">
            <Badge variant="secondary" className="font-medium bg-muted text-muted-foreground">
              {ex.fields.length} fields
            </Badge>
            <a
              href={`/api/bolform/examples/${ex.id}/pdf`}
              download
              onClick={(event) => event.stopPropagation()}
              className="text-sm font-semibold text-primary underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Download blank PDF
            </a>
          </CardFooter>
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
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
      {schema.fields.map((field) => {
        const valEntry = values.find(v => v.fieldId === field.id);
        const valString = valEntry?.value as string || "";
        const isFilled = !!valString;

        return (
          <div key={field.id} className={`p-5 rounded-2xl border transition-all ${isFilled ? 'bg-card border-border shadow-sm' : 'bg-transparent border-dashed border-border/60 hover:bg-muted/10'}`}>
            <label className="block text-sm font-semibold mb-1 text-card-foreground">
              {field.label}
              {field.required === 'required' && <span className="text-destructive ml-1">*</span>}
            </label>
            {field.instructions && (
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed max-w-[90%]">{field.instructions}</p>
            )}
            
            {field.type === 'multiline' ? (
              <Textarea 
                value={valString}
                onChange={(e) => onValueChange(field.id, e.target.value)}
                placeholder="Awaiting answer..."
                className={`resize-none min-h-[100px] text-base bg-background ${!isFilled ? "opacity-60" : "font-medium text-foreground"}`}
              />
            ) : (
              <Input 
                value={valString}
                onChange={(e) => onValueChange(field.id, e.target.value)}
                placeholder="Awaiting answer..."
                className={`h-12 text-base bg-background ${!isFilled ? "opacity-60" : "font-medium text-foreground"}`}
              />
            )}
            
            <div className="flex items-center gap-2 mt-4">
              <Badge variant={isFilled ? "default" : "outline"} className={`text-xs uppercase tracking-wider ${!isFilled && "text-muted-foreground bg-transparent"}`}>
                {isFilled ? 'Answered' : 'Pending'}
              </Badge>
              {valEntry?.status === 'needs_confirmation' && (
                <Badge variant="destructive" className="text-xs uppercase tracking-wider bg-destructive/10 text-destructive border-transparent">
                  Review Suggested
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
