/**
 * src/components/chat/ChatComposer.jsx
 * ---------------------------------------------------------------------------
 * Ô soạn tin kiểu Instagram:
 *   • textarea tự giãn (1 → 5 dòng), Enter gửi · Shift+Enter xuống dòng
 *   • nút 😊 mở bảng emoji nhanh (không tải thư viện ngoài)
 *   • nút 🖼 chọn ảnh, ẢNH ĐƯỢC NÉN NGAY TRONG TRÌNH DUYỆT trước khi gửi
 *     (dùng lại utils/imageCompress.js của trang Đăng ảnh)
 *   • báo "đang nhập…" cho người kia, tối đa 1 lần / 2,5 giây
 *   • đếm ký tự khi gần chạm giới hạn CHAT_MAX_MESSAGE_LENGTH
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.js';
import { chatApi } from '../../api/client.js';
import { compressImage, shouldCompress, formatBytes } from '../../utils/imageCompress.js';
import { ImageIcon, EmojiIcon, SendIcon, CloseIcon } from '../Icons.jsx';
import { SpinnerInline } from '../States.jsx';

/** Bộ emoji gọn nhẹ — đủ dùng hằng ngày, không cần thư viện. */
const QUICK_EMOJI = [
  '❤️', '😂', '😍', '😮', '😢', '😡', '👍', '🙏',
  '🔥', '🎉', '😊', '😎', '🤔', '😴', '🥰', '💪',
  '📷', '✨', '🌸', '🍀', '☕', '🌙', '☀️', '🏖️',
];

/** Nhịp tối thiểu giữa hai tín hiệu "đang nhập…" (ms) — tránh spam máy chủ. */
const TYPING_THROTTLE_MS = 2500;

export default function ChatComposer({
  conversationId,
  onSend,
  disabled = false,
  maxLength = 1000,
  maxAttachmentMb = 10,
  onError,
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastTypingRef = useRef(0);
  const stopTypingRef = useRef(null);

  /* ------------------------------ dọn ảnh xem trước ------------------------ */
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  /* ------------------------------ tự giãn chiều cao ----------------------- */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  /** Báo "đang nhập…" — gửi xong thì tự tắt sau 3 giây. */
  const pingTyping = () => {
    if (!conversationId) return;
    const now = Date.now();
    if (now - lastTypingRef.current > TYPING_THROTTLE_MS) {
      lastTypingRef.current = now;
      chatApi.typing(conversationId, true).catch(() => {});
    }
    clearTimeout(stopTypingRef.current);
    stopTypingRef.current = setTimeout(() => {
      lastTypingRef.current = 0;
      chatApi.typing(conversationId, false).catch(() => {});
    }, 3000);
  };

  /* --------------------------------- chọn ảnh ----------------------------- */
  const handleFile = async (inputFile) => {
    if (!inputFile) return;
    if (!inputFile.type.startsWith('image/') && !inputFile.type.startsWith('video/')) {
      onError?.(t('chat.fileTypeUnsupported'));
      return;
    }

    setCompressing(true);
    try {
      let chosen = inputFile;
      if (shouldCompress(inputFile)) {
        const result = await compressImage(inputFile);
        if (result?.file) chosen = result.file;
      }
      if (chosen.size > maxAttachmentMb * 1024 * 1024) {
        onError?.(t('chat.fileTooLarge', { max: maxAttachmentMb }));
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(chosen);
      setPreviewUrl(chosen.type.startsWith('image/') ? URL.createObjectURL(chosen) : null);
    } catch {
      onError?.(t('chat.attachFailed'));
    } finally {
      setCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
  };

  /* ---------------------------------- gửi --------------------------------- */
  const submit = async (event) => {
    event?.preventDefault();
    const body = text.trim();
    if ((!body && !file) || busy || disabled) return;

    setBusy(true);
    try {
      await onSend({ text: body, file });
      setText('');
      clearFile();
      setEmojiOpen(false);
      chatApi.typing(conversationId, false).catch(() => {});
    } catch (error) {
      onError?.(error.message || t('chat.sendFailed'));
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  };

  const onKeyDown = (event) => {
    // Enter = gửi (giống Instagram trên máy tính); Shift+Enter = xuống dòng.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = maxLength - text.length;
  const canSend = Boolean(text.trim() || file) && !busy && !disabled;

  return (
    <form onSubmit={submit} className="border-t border-ink-line bg-white px-3 py-2">
      {/* -------------------------- ảnh xem trước ---------------------------- */}
      {file && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-ink-bg p-2">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-ink-line text-lg">🎥</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{file.name || t('chat.attachment')}</p>
            <p className="text-[11px] text-ink-soft">{formatBytes(file.size)}</p>
          </div>
          <button type="button" onClick={clearFile} className="rounded-full p-1.5 text-ink-soft hover:bg-white" aria-label={t('common.cancel')}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* ------------------------------- emoji ---------------------------- */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setEmojiOpen((open) => !open)}
            className="rounded-full p-1.5 text-ink hover:bg-ink-bg"
            aria-label={t('chat.emoji')}
            aria-expanded={emojiOpen}
          >
            <EmojiIcon />
          </button>

          {emojiOpen && (
            <div className="absolute bottom-12 left-0 z-20 grid w-64 grid-cols-8 gap-1 rounded-2xl border border-ink-line bg-white p-2 shadow-xl">
              {QUICK_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setText((current) => (current + emoji).slice(0, maxLength));
                    textareaRef.current?.focus();
                  }}
                  className="rounded-lg p-1 text-xl leading-none hover:bg-ink-bg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* -------------------------------- ảnh ----------------------------- */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full p-1.5 text-ink hover:bg-ink-bg"
          aria-label={t('chat.attach')}
          disabled={compressing}
        >
          {compressing ? <SpinnerInline /> : <ImageIcon />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        {/* ------------------------------ nội dung -------------------------- */}
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            disabled={disabled || busy}
            onChange={(event) => {
              setText(event.target.value.slice(0, maxLength));
              pingTyping();
            }}
            onKeyDown={onKeyDown}
            placeholder={t('chat.placeholder')}
            className="w-full resize-none rounded-2xl border border-ink-line px-4 py-2 text-[15px] leading-6 outline-none
                       focus:border-ink-faint disabled:bg-ink-bg"
          />
          {remaining <= 80 && (
            <p className={`mt-1 text-right text-[11px] ${remaining <= 0 ? 'text-ig-red' : 'text-ink-soft'}`}>
              {remaining}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSend}
          className="rounded-full p-2 text-ig-blue transition disabled:opacity-40"
          aria-label={t('chat.send')}
        >
          {busy ? <SpinnerInline /> : <SendIcon />}
        </button>
      </div>
    </form>
  );
}
