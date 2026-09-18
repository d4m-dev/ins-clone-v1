/**
 * src/components/chat/ConversationList.jsx
 * ---------------------------------------------------------------------------
 * Cột trái của hộp thư — giống Instagram Direct:
 *   • hai thẻ "Hộp thư" và "Tin nhắn chờ" (kèm số lượng)
 *   • mỗi dòng: avatar · tên · trích đoạn tin cuối · thời gian · số tin chưa đọc
 *   • dòng chưa đọc được in đậm, có dấu chấm xanh
 *   • nút "viết tin mới" ở góc phải tiêu đề
 * ---------------------------------------------------------------------------
 */

import { ROUTES } from '../../../config/urls.js';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/index.js';
import Avatar from '../Avatar.jsx';
import { MessengerIcon, NewChatIcon } from '../Icons.jsx';
import { SpinnerInline } from '../States.jsx';
import { timeAgo } from '../../utils/format.js';

/** Một dòng hội thoại. */
function ConversationRow({ conversation, active, onSelect }) {
  const { t } = useI18n();
  const { peer, lastMessage, unreadCount, isRequest } = conversation;
  const unread = unreadCount > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation)}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition
        ${active ? 'bg-ink-bg' : 'hover:bg-ink-bg'}`}
    >
      <div className="relative shrink-0">
        <Avatar src={peer?.avatarUrl} name={peer?.fullName} size="md" ring={unread} />
        {unread && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-ig-blue" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-[15px] ${unread ? 'font-semibold' : 'font-medium'}`}>
            {peer?.fullName || peer?.username || t('chat.unknownUser')}
          </span>
          {isRequest && (
            <span className="shrink-0 rounded-full bg-ink-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
              {t('chat.tabRequests')}
            </span>
          )}
        </div>
        <p className={`truncate text-[13px] ${unread ? 'font-medium text-ink' : 'text-ink-soft'}`}>
          {lastMessage?.mine ? `${t('chat.you')}${t('chat.previewSeparator')}` : ''}
          {lastMessage?.preview || t('chat.noMessages')}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[11px] text-ink-soft">{timeAgo(lastMessage?.at || conversation.updatedAt)}</span>
        {unread && (
          <span className="rounded-full bg-ig-blue px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {!unread && lastMessage?.mine && lastMessage?.seen && (
          <span className="text-[10px] text-ink-soft">{t('chat.seen')}</span>
        )}
      </div>
    </button>
  );
}

export default function ConversationList({
  conversations = [],
  activeId,
  box = 'inbox',
  onBoxChange,
  onSelect,
  onNewChat,
  loading = false,
  requestsCount = 0,
  unreadTotal = 0,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      {/* ---------------------------------- đầu cột -------------------------- */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <MessengerIcon filled className="h-6 w-6 lg:hidden" />
          {t('chat.title')}
          {unreadTotal > 0 && (
            <span className="rounded-full bg-ig-blue px-2 py-0.5 text-xs font-semibold text-white">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </h1>

        <button
          type="button"
          onClick={onNewChat || (() => navigate(ROUTES.messages))}
          title={t('chat.newChat')}
          aria-label={t('chat.newChat')}
          className="rounded-full p-2 text-ink hover:bg-ink-bg"
        >
          <NewChatIcon />
        </button>
      </div>

      {/* ----------------------------------- thẻ ---------------------------- */}
      <div className="flex gap-2 px-4 pb-2">
        {[
          { id: 'inbox', label: t('chat.tabInbox'), badge: 0 },
          { id: 'requests', label: t('chat.tabRequests'), badge: requestsCount },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onBoxChange?.(tab.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition
              ${box === tab.id ? 'bg-ink text-white' : 'bg-ink-bg text-ink hover:bg-ink-line'}`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold
                  ${box === tab.id ? 'bg-white text-ink' : 'bg-ig-blue text-white'}`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* --------------------------------- danh sách ------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-soft">
            <SpinnerInline /> {t('common.loading')}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="px-4 py-10 text-center">
            <MessengerIcon className="mx-auto mb-3 h-10 w-10 text-ink-faint" />
            <p className="text-sm font-medium">
              {box === 'requests' ? t('chat.noRequests') : t('chat.emptyInbox')}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {box === 'requests' ? t('chat.noRequestsHint') : t('chat.emptyInboxHint')}
            </p>
            {box === 'inbox' && (
              <button
                type="button"
                onClick={onNewChat}
                className="mt-4 rounded-lg bg-ig-blue px-4 py-2 text-sm font-semibold text-white hover:bg-ig-blueHover"
              >
                {t('chat.newChat')}
              </button>
            )}
          </div>
        )}

        {!loading && conversations.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={Number(activeId) === Number(conversation.id)}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
