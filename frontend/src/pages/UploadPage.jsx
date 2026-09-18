/**
 * src/pages/UploadPage.jsx
 * ---------------------------------------------------------------------------
 * Trang đăng bài — hai chế độ: ẢNH và VIDEO (Reels).
 *
 *  • Component KHÔNG tự ghép URL: mọi request đi qua `postsApi` (api/client.js),
 *    endpoint lấy từ config/urls.js.
 *  • Video: đọc thời lượng + trích ảnh bìa (poster) NGAY TRÊN MÁY bằng
 *    <video> + <canvas> ⇒ backend không cần ffmpeg (chạy tốt trên Termux).
 *  • Backend vẫn là nơi quyết định: nó đọc lại thời lượng từ atom `mvhd`.
 *  • Nhạc nền là tuỳ chọn và được phát đồng bộ ở phía client, không mux.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import Layout from '../components/Layout.jsx';
import { Alert } from '../components/States.jsx';
import { CameraIcon, SpinnerIcon, CloseIcon, ReelsIcon, VolumeOnIcon } from '../components/Icons.jsx';
import { postsApi, ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.js';

const MAX_CAPTION = 500;
const MODES = { photo: 'photo', video: 'video' };

/** 65s → "1:05" (khớp với cách backend hiển thị). */
const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Đọc thời lượng và trích khung đầu làm ảnh bìa — hoàn toàn ở phía client.
 * Trả về object URL của video để xem trước; nơi gọi chịu trách nhiệm thu hồi.
 */
const inspectVideo = (file) =>
  new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (payload) => resolve({ previewUrl: objectUrl, ...payload });

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      // Tua tới 0.1s để tránh khung hình đen đầu clip.
      video.currentTime = Math.min(0.1, (duration || 1) / 2);
    };

    video.onseeked = () => {
      try {
        const width = Math.min(video.videoWidth || 720, 1080);
        const height = Math.round(width * ((video.videoHeight || 1280) / (video.videoWidth || 720)));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) =>
            done({
              duration: video.duration,
              posterFile: blob ? new File([blob], 'poster.jpg', { type: 'image/jpeg' }) : null,
            }),
          'image/jpeg',
          0.86
        );
      } catch {
        done({ duration: video.duration, posterFile: null });
      }
    };

    video.onerror = () => done({ duration: null, posterFile: null });
  });

export default function UploadPage() {
  const { user, config } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const audioInputRef = useRef(null);

  const [mode, setMode] = useState(MODES.photo);
  const [file, setFile] = useState(null); // ảnh, hoặc video ở chế độ video
  const [previewUrl, setPreviewUrl] = useState(null);
  const [posterFile, setPosterFile] = useState(null);
  const [duration, setDuration] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [audioTitle, setAudioTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('idle'); // idle | uploading | done
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  /* ------------------- giới hạn lấy từ /api/auth/config ------------------- */
  const limits = useMemo(
    () => ({
      photoMb: config?.maxUploadMb ?? 15,
      videoMb: config?.maxVideoMb ?? 60,
      audioMb: config?.maxAudioMb ?? 10,
      maxSeconds: config?.maxVideoDurationSeconds ?? 60,
      imageTypes: config?.allowedMimeTypes ?? ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      videoTypes: config?.allowedVideoMimeTypes ?? ['video/mp4', 'video/webm', 'video/quicktime'],
      audioTypes: config?.allowedAudioMimeTypes ?? ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav'],
    }),
    [config]
  );

  const acceptedTypes = mode === MODES.video ? limits.videoTypes : limits.imageTypes;
  const typeLabels = acceptedTypes.map((type) => type.split('/')[1]).join(' · ');
  const maxMb = mode === MODES.video ? limits.videoMb : limits.photoMb;

  /* ---------------- vòng đời object URL (tránh rò rỉ bộ nhớ) --------------- */
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const resetSelection = () => {
    setFile(null);
    setPosterFile(null);
    setDuration(null);
    setNotice(null);
  };

  const switchMode = (next) => {
    if (next === mode) return;
    resetSelection();
    setError(null);
    setMode(next);
  };

  /* ----------------------------- chọn tệp -------------------------------- */
  const pickFile = async (selectedFile) => {
    setError(null);
    setNotice(null);
    if (!selectedFile) return;

    if (!acceptedTypes.includes(selectedFile.type)) {
      setError(t('upload.unsupported', { types: typeLabels }));
      return;
    }
    if (selectedFile.size > maxMb * 1024 * 1024) {
      setError(t('upload.tooLarge', { max: maxMb }));
      return;
    }

    setFile(selectedFile);

    if (mode === MODES.video) {
      setInspecting(true);
      const meta = await inspectVideo(selectedFile);
      setInspecting(false);
      setPreviewUrl(meta.previewUrl);
      setPosterFile(meta.posterFile);
      setDuration(meta.duration);

      if (meta.duration && meta.duration > limits.maxSeconds + 0.5) {
        setError(
          t('upload.videoTooLong', {
            duration: formatDuration(meta.duration),
            max: limits.maxSeconds,
          })
        );
        setFile(null);
        return;
      }
      if (!meta.posterFile) setNotice(t('upload.posterFailed'));
      else setNotice(t('upload.videoReady', { duration: formatDuration(meta.duration) }));
    }
  };

  const pickAudio = (selectedFile) => {
    setError(null);
    if (!selectedFile) return;
    if (!limits.audioTypes.includes(selectedFile.type)) {
      setError(t('upload.unsupported', { types: limits.audioTypes.join(' · ') }));
      return;
    }
    if (selectedFile.size > limits.audioMb * 1024 * 1024) {
      setError(t('upload.tooLarge', { max: limits.audioMb }));
      return;
    }
    setAudioFile(selectedFile);
  };

  /* -------------------------------- gửi lên ------------------------------ */
  const submit = async (event) => {
    event.preventDefault();
    if (!file || status === 'uploading') return;
    if (mode === MODES.video && duration && duration > limits.maxSeconds + 0.5) return;

    setStatus('uploading');
    setError(null);
    try {
      const { post } = await postsApi.upload({
        // chế độ video: `video` là clip, `file` là ảnh bìa (tuỳ chọn)
        video: mode === MODES.video ? file : undefined,
        file: mode === MODES.video ? posterFile || undefined : file,
        audio: audioFile || undefined,
        audioTitle: audioTitle.trim() || undefined,
        durationSeconds: mode === MODES.video ? duration ?? undefined : undefined,
        caption: caption.trim(),
        location: location.trim(),
      });
      setStatus('done');
      navigate(post.isVideo ? ROUTES.reels : ROUTES.feed, { replace: true, state: { focusPostId: post.id } });
    } catch (err) {
      setStatus('idle');
      setError(err instanceof ApiError ? err.message : t('upload.failed'));
    }
  };

  if (!user) {
    return (
      <Layout>
        <Alert>{t('upload.loginRequired')}</Alert>
      </Layout>
    );
  }

  const uploading = status === 'uploading';

  return (
    <Layout>
      <div className="md:rounded-lg md:border md:border-ink-line md:bg-white">
        <header className="flex h-11 items-center justify-center border-b border-ink-line">
          <h1 className="text-base font-semibold">{t('upload.title')}</h1>
        </header>

        {/* ------------------------------ chế độ ------------------------------ */}
        <div className="flex border-b border-ink-line">
          {[
            { key: MODES.photo, label: t('upload.modePhoto'), Icon: CameraIcon },
            { key: MODES.video, label: t('upload.modeVideo'), Icon: ReelsIcon },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => switchMode(key)}
              aria-pressed={mode === key}
              className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition
                          ${mode === key ? 'border-b-2 border-ink text-ink' : 'text-ink-soft'}`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="p-4">
          {/* ------------------------- vùng chọn tệp ------------------------- */}
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              pickFile(event.dataTransfer.files?.[0]);
            }}
            className="relative flex aspect-square w-full cursor-pointer items-center justify-center
                       overflow-hidden rounded-lg border border-dashed border-ink-line bg-ink-bg"
          >
            {previewUrl ? (
              <>
                {mode === MODES.video ? (
                  <video src={previewUrl} className="h-full w-full object-contain" controls playsInline />
                ) : (
                  <img src={previewUrl} alt={t('upload.pick')} className="h-full w-full object-contain" />
                )}
                <button
                  type="button"
                  aria-label={t('upload.remove')}
                  onClick={(event) => {
                    event.stopPropagation();
                    resetSelection();
                    setPreviewUrl(null);
                  }}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="pointer-events-none flex flex-col items-center gap-2 px-6 text-center text-ink-soft">
                {inspecting ? <SpinnerIcon className="w-9 h-9" /> : <CameraIcon className="w-10 h-10" />}
                <p className="font-medium">
                  {inspecting ? t('upload.processing') : mode === MODES.video ? t('upload.pickVideo') : t('upload.pick')}
                </p>
                <p className="text-xs">
                  {mode === MODES.video
                    ? t('upload.videoHint', { max: limits.maxSeconds, size: limits.videoMb })
                    : t('upload.formats', { types: typeLabels, max: maxMb })}
                </p>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={acceptedTypes.join(',')}
            className="hidden"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

          {/* --------------------------- nhạc nền ---------------------------- */}
          {mode === MODES.video && (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-lg border border-ink-line px-3 py-2 text-sm text-ink-soft"
              >
                <VolumeOnIcon className="w-5 h-5" />
                {audioFile ? audioFile.name : t('upload.audio')}
              </button>
              <input
                ref={audioInputRef}
                type="file"
                accept={limits.audioTypes.join(',')}
                className="hidden"
                onChange={(event) => {
                  pickAudio(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              {audioFile && (
                <input
                  type="text"
                  value={audioTitle}
                  maxLength={120}
                  onChange={(event) => setAudioTitle(event.target.value)}
                  placeholder={t('upload.audioTitle')}
                  className="ig-input"
                />
              )}
            </div>
          )}

          {/* ---------------------------- chú thích --------------------------- */}
          <textarea
            value={caption}
            maxLength={MAX_CAPTION}
            onChange={(event) => setCaption(event.target.value)}
            rows={3}
            placeholder={t('upload.captionPlaceholder')}
            className="ig-input mt-3 resize-none"
          />
          <p className="pt-1 text-right text-xs text-ink-soft">
            {caption.length}/{MAX_CAPTION}
          </p>

          <input
            type="text"
            value={location}
            maxLength={120}
            onChange={(event) => setLocation(event.target.value)}
            placeholder={t('upload.locationPlaceholder')}
            className="ig-input mt-2"
          />

          {notice && <p className="pt-3 text-sm text-ink-soft">{notice}</p>}
          {error && (
            <p className="pt-3 text-sm text-ig-red" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!file || uploading || (mode === MODES.video && !duration)}
            className="ig-button mt-4 flex items-center justify-center gap-2"
          >
            {uploading && <SpinnerIcon className="w-4 h-4" />}
            {uploading ? t('upload.sharing') : t('upload.share')}
          </button>

          <p className="pt-3 text-center text-xs text-ink-soft">{t('upload.privacy')}</p>
        </form>
      </div>
    </Layout>
  );
}
