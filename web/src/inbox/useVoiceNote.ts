import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadMedia } from '../media/uploadImage';
import { micError, pickMimeType } from './useDictation';

export const MAX_VOICE_NOTE_SECONDS = 120;

/** Plenty for speech; two minutes stay near 1 MB, far under the server's 10 MB cap. */
const AUDIO_BITS_PER_SECOND = 64_000;

export type VoiceNoteState = 'idle' | 'recording' | 'preview' | 'sending';

/** Keys under `inbox.voiceRecorder.error.*` in the locale files. */
export type VoiceNoteError = 'denied' | 'noDevice' | 'failed' | 'upload' | 'tooLarge';

/** One recording: its own stream, recorder, timer and level meter, released together. */
type Recording = {
  media: MediaStream;
  recorder: MediaRecorder | null;
  timer: ReturnType<typeof setInterval> | null;
  audio: AudioContext | null;
  frame: number | null;
  discard: boolean;
};

function release(recording: Recording) {
  if (recording.timer) clearInterval(recording.timer);
  recording.timer = null;
  if (recording.frame !== null) cancelAnimationFrame(recording.frame);
  recording.frame = null;
  void recording.audio?.close().catch(() => {});
  recording.audio = null;
  recording.media.getTracks().forEach((track) => track.stop());
}

/**
 * Feed `onLevel` with the microphone's loudness (0 to 1) every frame. Best effort: where the
 * browser has no Web Audio there is simply no meter.
 */
function meter(recording: Recording, onLevel: (level: number) => void) {
  if (typeof AudioContext === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  try {
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    audio.createMediaStreamSource(recording.media).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    recording.audio = audio;
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      // Speech sits around 0.05 to 0.3 RMS; scale so normal talking fills most of the bar.
      onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
      recording.frame = requestAnimationFrame(tick);
    };
    recording.frame = requestAnimationFrame(tick);
  } catch {
    recording.audio = null;
  }
}

/**
 * Record a voice note, play it back, and send it. Nothing leaves the browser until the merchant
 * presses send: then the recording is uploaded as `audio` media and handed to `onSend`, which
 * sends it through the normal reply endpoint and resolves to whether that worked. A failed send
 * keeps the recording (and its upload) so the merchant can try again.
 */
export function useVoiceNote(
  onSend: (mediaId: string) => Promise<boolean>,
  options?: { upload?: typeof uploadMedia; maxSeconds?: number },
) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const [state, setState] = useState<VoiceNoteState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<VoiceNoteError | null>(null);
  const starting = useRef(false);
  const active = useRef<Recording | null>(null);
  const alive = useRef(true);
  // The finished recording, and its media id once uploaded, so a retry does not upload again.
  const take = useRef<{ blob: Blob; mediaId: string | null } | null>(null);
  const onSendRef = useRef(onSend);
  useEffect(() => {
    onSendRef.current = onSend;
  });

  // The preview's object URL is revoked by the effect below once it is replaced.
  const forgetTake = useCallback(() => {
    take.current = null;
    setPreviewUrl(null);
  }, []);

  const start = useCallback(async () => {
    if (starting.current || active.current) return;
    starting.current = true;
    setError(null);
    forgetTake();
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      starting.current = false;
      if (alive.current) setError(micError(e));
      return;
    }
    starting.current = false;
    const recording: Recording = {
      media,
      recorder: null,
      timer: null,
      audio: null,
      frame: null,
      discard: false,
    };
    if (!alive.current) {
      release(recording);
      return;
    }
    try {
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      rec.onstop = () => {
        release(recording);
        if (recording.discard || !alive.current || active.current !== recording) return;
        active.current = null;
        setLevel(0);
        if (chunks.length === 0) {
          setState('idle');
          setError('failed');
          return;
        }
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
        take.current = { blob, mediaId: null };
        setPreviewUrl(typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null);
        setState('preview');
      };
      recording.recorder = rec;
      rec.start();
    } catch {
      release(recording);
      setError('failed');
      return;
    }
    active.current = recording;
    meter(recording, setLevel);
    setSeconds(0);
    setState('recording');
    let elapsed = 0;
    recording.timer = setInterval(() => {
      elapsed += 1;
      setSeconds(elapsed);
      if (
        elapsed >= (optionsRef.current?.maxSeconds ?? MAX_VOICE_NOTE_SECONDS) &&
        recording.recorder?.state === 'recording'
      ) {
        recording.recorder.stop();
      }
    }, 1000);
  }, [forgetTake]);

  const stop = useCallback(() => {
    const recorder = active.current?.recorder;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  /** Throw the recording away, while recording or after. */
  const discard = useCallback(() => {
    const recording = active.current;
    active.current = null;
    if (recording) {
      recording.discard = true;
      if (recording.recorder?.state === 'recording') recording.recorder.stop();
      else release(recording);
    }
    forgetTake();
    setLevel(0);
    setError(null);
    setState('idle');
  }, [forgetTake]);

  const send = useCallback(async () => {
    const current = take.current;
    if (!current || state !== 'preview') return;
    setState('sending');
    setError(null);
    if (!current.mediaId) {
      const uploaded = await (optionsRef.current?.upload ?? uploadMedia)(current.blob, 'audio', {
        code: 'UPLOAD_FAILED',
        message: '',
        fields: {},
      });
      if (!alive.current) return;
      if (!uploaded.ok) {
        setError(uploaded.error.code === 'FILE_TOO_LARGE' ? 'tooLarge' : 'upload');
        setState('preview');
        return;
      }
      current.mediaId = uploaded.data;
    }
    const sent = await onSendRef.current(current.mediaId);
    if (!alive.current) return;
    if (sent) {
      forgetTake();
      setState('idle');
    } else {
      setState('preview'); // the composer shows why; the recording stays for another try
    }
  }, [state, forgetTake]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const recording = active.current;
      active.current = null;
      if (recording) {
        recording.discard = true;
        if (recording.recorder?.state === 'recording') recording.recorder.stop();
        else release(recording);
      }
    };
  }, []);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  return { state, seconds, level, previewUrl, error, start, stop, discard, send };
}

export type VoiceNote = ReturnType<typeof useVoiceNote>;
