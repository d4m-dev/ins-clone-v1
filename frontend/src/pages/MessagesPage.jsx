/**
 * src/pages/MessagesPage.jsx
 * ---------------------------------------------------------------------------
 * Hộp thư + khung chat (Instagram Direct).
 *
 * Một trang phục vụ hai đường dẫn:
 *   /messages       → danh sách hội thoại
 *   /messages/:id   → mở thẳng một hội thoại (deep link, thông báo, chia sẻ)
 *
 * Trên máy tính hiện hai cột (danh sách | khung chat). Trên điện thoại chỉ
 * hiện một cột: chọn hội thoại thì khung chat tràn màn hình, nút ← quay lại.
 *
 * Nguồn dữ liệu:
 *   • REST: danh sách hội thoại · tin nhắn (phân trang) · gửi · đã đọc · chấp nhận
 *   • SSE:  tin mới · đã xem · đang nhập · hội thoại đổi trạng thái
 *   • Khi SSE không khả dụng: hook useChatStream tự hỏi định kỳ và đồng bộ lại.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import { useI18n } from '../i18n/index.js';
import { chatApi } from '../api/client.js';
import ConversationList from '../components/chat/ConversationList.jsx';
import MessageThread from '../components/chat/MessageThread.jsx';
import PersonPickerDialog from '../components/chat/PersonPickerDialog.jsx';
import { Alert, Spinner } from '../components/States.jsx';
import { MessengerIcon } from '../components/Icons.jsx';
import useChatStream from '../hooks/useChatStream.js';
import { refreshChatBadge } from '../hooks/useChatBadge.js';

/** Bao lâu thì coi "đang nhập…" đã dừng nếu không nhận thêm tín hiệu (ms). */
const TYPING_TIMEOUT_MS = 5000;

export default function MessagesPage() {
  const { t } = useI18n();
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [box, setBox] = useState('inbox');
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingPeer, setTypingPeer] = useState(false);

  const typingTimerRef = useRef(null);
  const activeIdRef = useRef(null);
  activeIdRef.current = conversation?.id || (routeId ? Number(routeId) : null);

  /* ====================================================================== */
  /*                             1. Danh sách hội thoại                      */
  /* ====================================================================== */

  const loadConversations = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoadingList(true);
      try {
        const data = await chatApi.conversations({ box });
        setConversations(data?.conversations || []);
        setError('');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingList(false);
      }
    },
    [box]
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  /* ====================================================================== */
  /*                              2. Kênh realtime                           */
  /* ====================================================================== */

  const handleEvent = useCallback(
    (event, payload) => {
      switch (event) {
        /* ------------------------------ tin mới ------------------------- */
        case 'message': {
          const incoming = payload?.message;
          if (!incoming) return;

          // Nếu đang mở đúng hội thoại đó → chèn tin, và báo đã đọc ngay.
          if (Number(incoming.conversationId) === Number(activeIdRef.current)) {
            setMessages((current) =>
              current.some((item) => item.id === incoming.id) ? current : [...current, incoming]
            );
            setTypingPeer(false);
            if (!incoming.mine) chatApi.markRead(incoming.conversationId).catch(() => {});
          }

          // Tin của người khác → hộp thư (badge) cập nhật ngay lập tức.
          loadConversations({ silent: true });
          if (!incoming.mine) refreshChatBadge();
          return;
        }

        /* ---------------------------- đã xem ---------------------------- */
        case 'read': {
          setMessages((current) =>
            current.map((item) =>
              item.mine && !item.seen ? { ...item, seen: true, readAt: payload?.readAt } : item
            )
          );
          loadConversations({ silent: true });
          return;
        }

        /* --------------------------- đang nhập… ------------------------- */
        case 'typing': {
          if (Number(payload?.conversationId) !== Number(activeIdRef.current)) return;
          setTypingPeer(Boolean(payload?.typing));
          clearTimeout(typingTimerRef.current);
          if (payload?.typing) {
            typingTimerRef.current = setTimeout(() => setTypingPeer(false), TYPING_TIMEOUT_MS);
          }
          return;
        }

        /* --------------------- hội thoại mới / đổi trạng thái ----------- */
        case 'conversation':
        case 'deleted': {
          loadConversations({ silent: true });
          if (
            event === 'conversation' &&
            payload?.conversation?.peerId &&
            Number(payload?.conversation?.peerId) !== Number(activeIdRef.current)
          ) {
            refreshChatBadge();
          }
          if (event === 'deleted') {
            setMessages((current) =>
              current.map((item) =>
                item.id === payload?.messageId ? { ...item, isDeleted: true, body: null } : item
              )
            );
          }
          return;
        }

        /* --------------------------- nhịp đồng bộ ----------------------- */
        case 'summary':
        default:
          return;
      }
    },
    [loadConversations]
  );

  const { connected } = useChatStream({ onEvent: handleEvent });

  /* ====================================================================== */
  /*                            3. Hội thoại đang mở                         */
  /* ====================================================================== */

  const openConversation = useCallback(
    async (conversationId, { silent = false } = {}) => {
      if (!conversationId) return;
      if (!silent) {
        setLoadingThread(true);
        setMessages([]);
      }
      try {
        const [detail, page] = await Promise.all([
          chatApi.conversation(conversationId),
          chatApi.messages(conversationId),
        ]);
        setConversation(detail?.conversation || detail);
        setMessages(page?.messages || []);
        setHasMore(Boolean(page?.hasMore));
        await chatApi.markRead(conversationId).catch(() => {});
        refreshChatBadge();
        setError('');
      } catch (err) {
        setError(err.message);
        setConversation(null);
      } finally {
        setLoadingThread(false);
      }
    },
    []
  );

  /** Mở theo deep link /messages/:id. */
  useEffect(() => {
    if (!routeId) {
      setConversation(null);
      setMessages([]);
      return;
    }
    openConversation(Number(routeId));
  }, [routeId, openConversation]);

  /** Tải thêm tin cũ hơn khi cuộn lên đầu (phân trang ngược bằng `before`). */
  const loadOlder = useCallback(async () => {
    if (!conversation || loadingOlder || !hasMore) return;
    const oldest = messages[0]?.id;
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.messages(conversation.id, { before: oldest });
      setMessages((current) => [...(page?.messages || []), ...current]);
      setHasMore(Boolean(page?.hasMore));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversation, hasMore, loadingOlder, messages]);

  /* ====================================================================== */
  /*                               4. Hành động                              */
  /* ====================================================================== */

  const selectConversation = (item) => {
    if (item.isRequest) {
      // Mở nhưng KHÔNG tự chấp nhận — người dùng phải bấm Đồng ý.
      navigate(ROUTES.conversation(item.id));
      return;
    }
    navigate(ROUTES.conversation(item.id));
  };

  const sendMessage = async ({ text, file }) => {
    if (!conversation) return;
    setSending(true);
    try {
      // Có ảnh → multipart (FormData); chỉ chữ → JSON. URL luôn do client.js lo.
      const result = file
        ? await chatApi.sendFile(conversation.id, { file, body: text })
        : await chatApi.send(conversation.id, { body: text });

      const message = result?.message;
      if (message) {
        setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
      }
      loadConversations({ silent: true });
    } finally {
      setSending(false);
    }
  };

  const acceptRequest = async (conversationId) => {
    try {
      await chatApi.accept(conversationId);
      setConversation((current) => (current ? { ...current, status: 'accepted', isRequest: false } : current));
      setBox('inbox');
      loadConversations();
      refreshChatBadge();
    } catch (err) {
      setError(err.message);
    }
  };

  const declineRequest = async (conversationId) => {
    try {
      await chatApi.decline(conversationId);
      navigate(ROUTES.messages, { replace: true });
      loadConversations();
      refreshChatBadge();
    } catch (err) {
      setError(err.message);
    }
  };

  const unsendMessage = async (message) => {
    try {
      await chatApi.unsend(message.id);
      setMessages((current) =>
        current.map((item) => (item.id === message.id ? { ...item, isDeleted: true, body: null } : item))
      );
      loadConversations({ silent: true });
    } catch (err) {
      setError(err.message);
    }
  };

  const openFromPicker = ({ conversationId }) => {
    if (conversationId) navigate(ROUTES.conversation(conversationId));
  };

  /* ====================================================================== */
  /*                                5. Giao diện                             */
  /* ====================================================================== */

  const requestsCount = useMemo(
    () => conversations.filter((item) => item.isRequest).length,
    [conversations]
  );
  const unreadTotal = useMemo(
    () => conversations.reduce((sum, item) => sum + (item.unreadCount || 0), 0),
    [conversations]
  );

  const showThreadOnMobile = Boolean(routeId);

  return (
    <div className="flex h-[calc(100dvh-3rem)] w-full overflow-hidden border-ink-line bg-white md:h-[calc(100dvh-3.5rem)] md:rounded-xl md:border">
      {/* ------------------------------ cột danh sách ----------------------- */}
      <section
        className={`w-full shrink-0 border-r border-ink-line md:w-[350px] lg:w-[380px]
          ${showThreadOnMobile ? 'hidden md:block' : 'block'}`}
      >
        <ConversationList
          conversations={conversations}
          activeId={conversation?.id}
          box={box}
          onBoxChange={setBox}
          onSelect={selectConversation}
          onNewChat={() => setPickerOpen(true)}
          loading={loadingList}
          requestsCount={requestsCount}
          unreadTotal={unreadTotal}
        />
      </section>

      {/* ------------------------------ khung chat -------------------------- */}
      <section className={`min-w-0 flex-1 ${showThreadOnMobile ? 'block' : 'hidden md:block'}`}>
        {error && (
          <div className="p-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {loadingThread && (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        )}

        {!loadingThread && conversation && (
          <MessageThread
            conversation={conversation}
            messages={messages}
            hasMore={hasMore}
            loadingOlder={loadingOlder}
            sending={sending}
            peerTyping={typingPeer}
            connected={connected}
            onLoadOlder={loadOlder}
            onSend={sendMessage}
            onAccept={acceptRequest}
            onDecline={declineRequest}
            onUnsend={unsendMessage}
            onRead={(conversationId) => chatApi.markRead(conversationId).catch(() => {})}
            onBack={() => navigate(ROUTES.messages)}
          />
        )}

        {!loadingThread && !conversation && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <MessengerIcon className="h-14 w-14 text-ink-faint" />
            <p className="text-lg font-semibold">{t('chat.title')}</p>
            <p className="max-w-xs text-sm text-ink-soft">{t('chat.pickHint')}</p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-lg bg-ig-blue px-4 py-2 text-sm font-semibold text-white hover:bg-ig-blueHover"
            >
              {t('chat.newChat')}
            </button>
          </div>
        )}
      </section>

      <PersonPickerDialog
        open={pickerOpen}
        mode="new"
        conversations={conversations}
        onClose={() => setPickerOpen(false)}
        onPicked={openFromPicker}
      />
    </div>
  );
}
