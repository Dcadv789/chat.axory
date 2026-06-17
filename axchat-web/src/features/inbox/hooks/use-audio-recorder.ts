'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type RecordingState = 'idle' | 'recording' | 'stopped';

export type AudioInputDevice = {
  deviceId: string;
  label: string;
};

/**
 * Wraps the browser's MediaRecorder API with React-friendly state.
 * The hook owns the MediaStream lifecycle — it releases the microphone on
 * unmount or when the recording finishes, so the tab's mic indicator doesn't
 * stay lit after the user sends the message.
 */
export function useAudioRecorder() {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string>('audio/webm');
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedDeviceIdRef = useRef(selectedDeviceId);

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  const pickMime = (): string => {
    if (typeof window === 'undefined') return 'audio/webm';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) {
        return m;
      }
    }
    return 'audio/webm';
  };

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    releaseStream();
    recorderRef.current = null;
  }, [releaseStream]);

  useEffect(() => cleanup, [cleanup]);

  const refreshDevices = useCallback(async (requestPermission = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    setIsLoadingDevices(true);
    try {
      if (requestPermission) {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach((t) => t.stop());
      }

      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microfone ${index + 1}`,
        }));

      setDevices(inputs);

      const current = selectedDeviceIdRef.current;
      const stillValid = inputs.some((d) => d.deviceId === current);
      if (!stillValid && inputs.length > 0) {
        const preferred =
          inputs.find((d) => d.deviceId === 'default') ??
          inputs.find((d) => !d.label.toLowerCase().includes('virtual')) ??
          inputs[0];
        setSelectedDeviceId(preferred.deviceId);
      }
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Permissão de microfone negada'
          : err?.message || 'Não foi possível listar microfones';
      setError(msg);
    } finally {
      setIsLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    void refreshDevices(false);

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        void refreshDevices(false);
      });
    }
  }, [refreshDevices]);

  const start = useCallback(async () => {
    setError(null);
    setBlob(null);
    setElapsedMs(0);
    chunksRef.current = [];

    try {
      if (devices.length === 0) {
        await refreshDevices(true);
      }

      const deviceId = selectedDeviceIdRef.current;
      const audioConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { ideal: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      streamRef.current = stream;

      const chosenMime = pickMime();
      setMimeType(chosenMime);
      const recorder = new MediaRecorder(stream, { mimeType: chosenMime });
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const out = new Blob(chunksRef.current, { type: chosenMime });
        releaseStream();

        if (out.size === 0) {
          setError('Nenhum áudio capturado. Tente outro microfone.');
          setBlob(null);
          setState('idle');
          return;
        }

        setBlob(out);
        setState('stopped');
      };

      startedAtRef.current = Date.now();
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);

      recorder.start(250);
      setState('recording');
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Permissão de microfone negada'
          : err?.name === 'NotFoundError'
            ? 'Microfone não encontrado. Escolha outro dispositivo.'
            : err?.message || 'Erro ao acessar microfone';
      setError(msg);
      setState('idle');
      cleanup();
    }
  }, [cleanup, devices.length, refreshDevices, releaseStream]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    cleanup();
    setBlob(null);
    setState('idle');
    setElapsedMs(0);
    chunksRef.current = [];
  }, [cleanup]);

  const reset = useCallback(() => {
    setBlob(null);
    setState('idle');
    setElapsedMs(0);
    chunksRef.current = [];
  }, []);

  return {
    state,
    elapsedMs,
    error,
    blob,
    mimeType,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices,
    isLoadingDevices,
    start,
    stop,
    cancel,
    reset,
  };
}
