export interface ProviderStatus {
  configured: boolean;
  chat: 'ready' | 'blocked' | 'unchecked';
  speech: 'ready' | 'blocked' | 'unchecked';
  transcription: 'ready' | 'blocked' | 'unchecked';
  documentAi: 'ready' | 'blocked' | 'unchecked';
  message: string;
}
