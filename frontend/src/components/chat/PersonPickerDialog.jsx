/**
 * src/components/chat/PersonPickerDialog.jsx
 * ---------------------------------------------------------------------------
 * Hộp thoại "chọn người" dùng cho hai việc:
 *   1. mode="new"   → bắt đầu một cuộc trò chuyện mới (nút ✎ ở hộp thư)
 *   2. mode="share" → chia sẻ một bài viết vào tin nhắn (nút Chia sẻ ở bài đăng)
 *
 * Có tìm kiếm (gọi /api/chat/people), gợi ý "gần đây" từ danh sách hội thoại,
 * và thông báo khi tin rơi vào mục "Tin nhắn chờ" (người lạ nhắn lần đầu).
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.js';
import { chatApi } from '../../api/client.js';
import Avatar from '../Avatar.jsx';
import { CloseIcon, SearchIcon, SendIcon } from '../Icons.jsx';
import { SpinnerInline, Alert } from '../States.jsx';

const DEBOUNCE_MS = 300;

export default function PersonPickerDialog({
  open,
  mode = 'new',
  postId = null,
  conversations = [],
  onClose,
  onPicked,
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ownRecent, setOwnRecent] = useState([]);
  const inputRef = useRef(null);

  /**
   * Gợi ý mặc định: những người vừa nhắn gần đây.
   * Nơi gọi có thể truyền sẵn `conversations` (trang Hộp thư); nếu không (ví dụ
   * nút Chia sẻ trên bài viết), hộp thoại tự nạp một lần khi mở.
   */
  const source = conversations.length ? conversations : ownRecent;
  const recent = useMemo(
    () =>
      source
        .filter((conversation) => conversation.status !== 'requested' || conversation.lastMessage?.mine)
        .slice(0, 8)
        .map((conversation) => ({ ...conversation.peer, conversationId: conversation.id })),
    [source]
  );

  useEffect(() => {
    if (!open || conversations.length) return undefined;
    let alive = true;
    chatApi
      .conversations({ box: 'inbox', limit: 20 })
      .then((data) => alive && setOwnRecent(data?.conversations || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, conversations.length]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPeople([]);
    setError('');
    setNotice('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  /** Tìm người theo từ khoá (chờ 300ms cho khỏi gọi liên tục). */
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setPeople([]);
        return;
      }
      setLoading(true);
      try {
        const data = await chatApi.people(query.trim());
        if (alive) setPeople(data?.people || []);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  const list = query.trim() ? people : recent;

  /** Chọn một người: mở hội thoại, hoặc gửi bài viết được chia sẻ. */
  const pick = async (person) => {
    setBusyId(person.id);
    setError('');
    try {
      if (mode === 'share') {
        const result = await chatApi.sendToUser({ userId: person.id, sharedPostId: postId, body: '' });
        setNotice(
          result?.conversationStatus === 'requested'
            ? t('chat.sharedAsRequest')
            : t('chat.sharedDone', { name: person.fullName || person.username })
        );
        onPicked?.(result);
        setTimeout(onClose, 1200);
        return;
      }

      let conversationId = person.conversationId;
      if (!conversationId) {
        const created = await chatApi.openConversation(person.id);
        conversationId = created?.conversation?.id;
      }
      onPicked?.({ conversationId, person });
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white">
        <header className="flex items-center justify-between border-b border-ink-line px-4 py-3">
          <h2 className="text-base font-semibold">
            {mode === 'share' ? t('chat.shareTo') : t('chat.newChat')}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-full p-1.5 hover:bg-ink-bg">
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="relative border-b border-ink-line px-4 py-2">
          <SearchIcon className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('chat.searchPeople')}
            className="w-full rounded-lg bg-ink-bg py-2 pl-8 pr-3 text-sm outline-none"
          />
        </div>

        {error && (
          <div className="px-4 pt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {notice && (
          <div className="px-4 pt-3">
            <Alert tone="success">{notice}</Alert>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-ink-soft">
              <SpinnerInline /> {t('common.loading')}
            </div>
          )}

          {!loading && list.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-soft">
              {query.trim() ? t('chat.noPeopleFound') : t('chat.noRecent')}
            </p>
          )}

          {!loading &&
            list.map((person) => (
              <button
                key={person.id}
                type="button"
                disabled={busyId === person.id}
                onClick={() => pick(person)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-ink-bg disabled:opacity-50"
              >
                <Avatar src={person.avatarUrl} name={person.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{person.fullName || person.username}</span>
                  <span className="block truncate text-xs text-ink-soft">@{person.username}</span>
                </span>
                {busyId === person.id ? <SpinnerInline /> : <SendIcon className="h-4 w-4 text-ig-blue" />}
              </button>
            ))}
        </div>

        {mode === 'share' && (
          <p className="border-t border-ink-line px-4 py-2 text-[11px] text-ink-soft">{t('chat.shareHint')}</p>
        )}
      </div>
    </div>
  );
}
