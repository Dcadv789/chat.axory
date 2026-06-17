'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type RecordingState = 'idle' | 'recording' | 'stopped';

export type AudioInputDevice = {
  deviceId: string;
  label: string;
};

const MIC_STORAGE_KEY = 'axchat_mic_device_id';

function normalizeInputDevices(devices: MediaDeviceInfo[]): AudioInputDevice[] {
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const real = inputs.filter(
    (d) => d.deviceId && !['default', 'communications'].includes(d.deviceId),
  );
  const source = real.length > 0 ? real : inputs;

  return source.map((d, index) => ({
    deviceId: d.deviceId,
    label: d.label?.trim() || `Microfone ${index + 1}`,
  }));
}

function buildAudioConstraints(deviceId: string): MediaTrackConstraints {
  if (!deviceId || deviceId === 'default' || deviceId === 'communications') {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
  }

  return {
    deviceId: { exact: deviceId },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

function createMediaRecorder(stream: MediaStream): { recorder: MediaRecorder; mimeType: string } {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(mime)) {
      try {
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        return { recorder, mimeType: recorder.mimeType || mime };
      } catch {
        // try next
      }
    }
  }

  const recorder = new MediaRecorder(stream);
  return { recorder, mimeType: recorder.mimeType || 'audio/webm' };
}

async function openMicrophone(deviceId: string): Promise<MediaStream> {
  const attempts: MediaTrackConstraints[] = deviceId
    ? [buildAudioConstraints(deviceId), { deviceId: { ideal: deviceId } }, buildAudioConstraints('')]
    : [buildAudioConstraints('')];

  let lastError: unknown;
  for (const audio of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

/**
 * Wraps the browser's MediaRecorder API with React-friendly state.
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
  const [audioLevel, setAudioLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  const cancelledRef = useRef(false);
  const mimeTypeRef = useRef('audio/webm');
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const stopTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const cleanup = useCallback(() => {
    stopTicker();
    releaseStream();
    recorderRef.current = null;
  }, [releaseStream, stopTicker]);

  useEffect(() => cleanup, [cleanup]);

  const pickInitialDevice = useCallback((inputs: AudioInputDevice[]) => {
    if (inputs.length === 0) return;

    const saved =
      typeof window !== 'undefined' ? localStorage.getItem(MIC_STORAGE_KEY) : null;
    const current = selectedDeviceIdRef.current;

    if (current && inputs.some((d) => d.deviceId === current)) return;
    if (saved && inputs.some((d) => d.deviceId === saved)) {
      setSelectedDeviceId(saved);
      selectedDeviceIdRef.current = saved;
      return;
    }

    const preferred =
      inputs.find((d) => d.label.toLowerCase().includes('microfone')) ??
      inputs[0];
    setSelectedDeviceId(preferred.deviceId);
    selectedDeviceIdRef.current = preferred.deviceId;
  }, []);

  const refreshDevices = useCallback(
    async (requestPermission = false): Promise<AudioInputDevice[]> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
        return [];
      }

      setIsLoadingDevices(true);
      try {
        if (requestPermission) {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
          tmp.getTracks().forEach((t) => t.stop());
        }

        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = normalizeInputDevices(all);
        setDevices(inputs);
        pickInitialDevice(inputs);
        return inputs;
      } catch (err: any) {
        const msg =
          err?.name === 'NotAllowedError'
            ? 'Permissão de microfone negada'
            : err?.message || 'Não foi possível listar microfones';
        setError(msg);
        return [];
      } finally {
        setIsLoadingDevices(false);
      }
    },
    [pickInitialDevice],
  );

  const selectDevice = useCallback((deviceId: string) => {
    selectedDeviceIdRef.current = deviceId;
    setSelectedDeviceId(deviceId);
    setError(null);
    try {
      localStorage.setItem(MIC_STORAGE_KEY, deviceId);
    } catch {
      // ignore
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setBlob(null);
    setElapsedMs(0);
    setAudioLevel(0);
    chunksRef.current = [];
    cancelledRef.current = false;

    try {
      let deviceList = devices;
      if (deviceList.length === 0) {
        deviceList = await refreshDevices(true);
      }

      if (deviceList.length === 0) {
        throw new Error('Nenhum microfone encontrado');
      }

      const deviceId = selectedDeviceIdRef.current || deviceList[0].deviceId;
      const stream = await openMicrophone(deviceId);
      streamRef.current = stream;

      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
      } catch {
        // level meter is optional
      }

      const { recorder, mimeType: chosenMime } = createMediaRecorder(stream);
      mimeTypeRef.current = chosenMime;
      setMimeType(chosenMime);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stopTicker();
        releaseStream();

        if (cancelledRef.current) {
          cancelledRef.current = false;
          chunksRef.current = [];
          return;
        }

        const type = mimeTypeRef.current.split(';')[0] || 'audio/webm';
        const out = new Blob(chunksRef.current, { type });

        if (out.size < 200) {
          setError('Nenhum áudio capturado. Escolha outro microfone nas configurações.');
          setBlob(null);
          setState('idle');
          chunksRef.current = [];
          return;
        }

        setBlob(out);
        setState('stopped');
      };

      recorder.onerror = () => {
        setError('Erro durante a gravação. Tente novamente.');
        cancelledRef.current = true;
        cleanup();
        setState('idle');
      };

      startedAtRef.current = Date.now();
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);

        const analyser = analyserRef.current;
        if (analyser) {
          const buffer = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) sum += buffer[i];
          setAudioLevel(sum / buffer.length / 255);
        }
      }, 100);

      recorder.start();
      setState('recording');
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Permissão de microfone negada'
          : err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError'
            ? 'Microfone não encontrado. Escolha outro nas configurações.'
            : err?.message || 'Erro ao acessar microfone';
      setError(msg);
      setState('idle');
      cleanup();
    }
  }, [cleanup, devices, refreshDevices, releaseStream, stopTicker]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    try {
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
      recorder.stop();
    } catch {
      cleanup();
      setState('idle');
    }
  }, [cleanup]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
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
    selectDevice,
    refreshDevices,
    isLoadingDevices,
    audioLevel,
    start,
    stop,
    cancel,
    reset,
  };
}
