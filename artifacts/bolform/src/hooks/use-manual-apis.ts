import { useMutation } from '@tanstack/react-query';
import type { FormSchema, FieldValue } from '@workspace/api-client-react';

export const useImportForm = () => {
  return useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch('/api/bolform/import', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-Filename': encodeURIComponent(file.name),
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error('Failed to import form');
      }
      
      return (await response.json()) as FormSchema;
    }
  });
};

export const useTranscribeAudio = () => {
  return useMutation({
    mutationFn: async ({ blob, language }: { blob: Blob; language: string }) => {
      const response = await fetch('/api/bolform/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Audio-Mime': blob.type || 'audio/webm',
          'X-Language': language,
        },
        body: blob,
      });

      if (!response.ok) {
        throw new Error('Failed to transcribe audio');
      }

      const result = (await response.json()) as { transcript: string };
      return { text: result.transcript };
    }
  });
};

export const useExportForm = () => {
  return useMutation({
    mutationFn: async (payload: { schema: FormSchema, values: FieldValue[] }) => {
      const response = await fetch('/api/bolform/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to export form');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bolform_export_${Date.now()}.pdf`; // Depending on backend type, default to pdf for now or use res header
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }
  });
};
