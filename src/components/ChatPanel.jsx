import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { chatAPI, usersAPI } from '../utils/api';
import { connectSocket, disconnectSocket } from '../utils/socket';
import { playChatNotificationSound, isChatSoundMuted, setChatSoundMuted } from '../utils/chatSound';
import { EMOJI_GROUPS } from '../utils/emojiList';
import { useToast } from '../utils/ToastContext';

// Floating chat panel: a shared "Team Chat" channel plus 1-on-1 DMs, both
// scoped to Secretariat + Admin (same audience as the "who's online"
// list this was built alongside). Real-time delivery uses Socket.IO — a
// WebSocket, not polling, the standard approach for chat: lower latency,
// no wasted requests when nothing's been said, and it scales the way a
// persistent connection does rather than a timer. Sending still goes
// over plain REST (POST /chat/messages), which then broadcasts to the
// right socket room(s) — see server/lib/socket.js for why that split is
// deliberate rather than a shortcut.
//
// Navigation follows the same "conversation list → open one → back"
// pattern most messengers use (Messenger, WhatsApp) rather than trying
// to show a sidebar and a thread side-by-side in a floating panel this
// size.

// Replaces literal "@Full Name" occurrences that correspond to a real
// mention with a styled span — matching on the NAME the mention
// autocomplete actually inserted, not re-parsing "@word" text generically
// (which is exactly the ambiguity — "which John" — storing real user ids
// client-side avoids in the first place; see the schema note in
// server/models.js).
function renderMessageWithMentions(text, mentionIds, nameById, currentUserId) {
  if (!mentionIds || mentionIds.length === 0) return text;
  const names = mentionIds
    .map(id => nameById.get(id))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first, so "@John Smith" isn't cut short by a "@John" match
  if (names.length === 0) return text;

  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`@(${escaped.join('|')})`, 'g');
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const mentionedId = mentionIds.find(id => nameById.get(id) === match[1]);
    const isMe = mentionedId === currentUserId;
    parts.push(
      <span key={key++} className={isMe ? 'bg-amber-200 text-amber-900 font-semibold rounded px-0.5' : 'text-teal-700 font-semibold'}>
        {match[0]}
      </span>
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export default function ChatPanel({ currentUserId, currentUserName }) {
  const { showToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'thread'
  const [conversations, setConversations] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);

  const [activeKey, setActiveKey] = useState(null); // 'team' | userId | null
  const [threadsByKey, setThreadsByKey] = useState({}); // key -> { messages, hasMore, loaded }
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState(new Set()); // reuses the same GET /users/online this app's "who's online" dropdown already uses
  const [soundMuted, setSoundMuted] = useState(isChatSoundMuted());
  const [draft, setDraft] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState([]);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null); // { text, start } while composing an @mention, else null

  const isOpenRef = useRef(isOpen);
  const activeKeyRef = useRef(activeKey);
  const viewRef = useRef(view); // read inside socket handlers below, which are set up once and must never see a stale 'list'/'thread' value
  const messageListRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { activeKeyRef.current = activeKey; }, [activeKey]);
  useEffect(() => { viewRef.current = view; }, [view]);

  const nameById = useMemo(() => {
    const map = new Map(roster.map(u => [u._id, u.name]));
    map.set(currentUserId, currentUserName);
    return map;
  }, [roster, currentUserId, currentUserName]);
  const nameByIdRef = useRef(nameById); // read inside socket handlers below, for the same reason viewRef exists — roster loads asynchronously, and this must see the CURRENT map once it does, not the empty one from mount
  useEffect(() => { nameByIdRef.current = nameById; }, [nameById]);

  // A conversation's key, from MY point of view, for an incoming message:
  // 'team' for the shared channel, otherwise whichever of sender/recipient
  // isn't me — the other participant is the only thing that identifies a
  // DM thread from either side of it.
  const conversationKeyFor = useCallback((message) => {
    if (!message.recipientId) return 'team';
    const senderId = message.senderId?._id || message.senderId;
    const recipientId = message.recipientId?._id || message.recipientId;
    return senderId === currentUserId ? recipientId : senderId;
  }, [currentUserId]);

  // ── Initial load + socket wiring ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [convos, people, online] = await Promise.all([
          chatAPI.getConversations(),
          chatAPI.getRoster(),
          usersAPI.getOnline()
        ]);
        if (!cancelled) {
          setConversations(convos);
          setRoster(people);
          setOnlineIds(new Set(online.map(u => u._id)));
        }
      } catch {
        // Leave the panel usable — it'll just show an empty list until
        // the next open, and new messages still arrive live once
        // connected.
      } finally {
        if (!cancelled) setLoadingConversations(false);
      }
    })();

    const socket = connectSocket();
    if (socket) {
      const handleConnect = () => setConnected(true);
      const handleDisconnect = () => setConnected(false);

      const handleNewMessage = (message) => {
        const key = conversationKeyFor(message);
        const isMine = (message.senderId?._id || message.senderId) === currentUserId;
        const isActiveAndOpen = isOpenRef.current && viewRef.current === 'thread' && activeKeyRef.current === key;

        setThreadsByKey(prev => {
          const existing = prev[key];
          if (!existing?.loaded) return prev; // not cached — will load fresh when opened
          return { ...prev, [key]: { ...existing, messages: [...existing.messages, message] } };
        });

        setConversations(prev => {
          const others = prev.filter(c => c.key !== key);
          const existing = prev.find(c => c.key === key);
          const updated = {
            key,
            name: key === 'team' ? 'Team Chat' : (existing?.name || nameByIdRef.current.get(key) || 'Unknown user'),
            lastMessage: message.message,
            lastMessageAt: message.createdAt,
            unreadCount: isMine || isActiveAndOpen ? (existing?.unreadCount || 0) : (existing?.unreadCount || 0) + 1
          };
          return [updated, ...others].sort((a, b) => {
            if (a.key === 'team') return -1;
            if (b.key === 'team') return 1;
            return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
          });
        });

        if (isActiveAndOpen) {
          chatAPI.markRead(key).catch(() => {});
        }

        if (!isMine) {
          playChatNotificationSound();
        }
      };

      const handleMentioned = (message) => {
        const isActiveAndOpen = isOpenRef.current && viewRef.current === 'thread' && activeKeyRef.current === conversationKeyFor(message);
        if (!isActiveAndOpen) {
          showToast(`${message.senderName} mentioned you`, 'success');
        }
      };

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('chat:new-message', handleNewMessage);
      socket.on('chat:mentioned', handleMentioned);
      setConnected(socket.connected);

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('chat:new-message', handleNewMessage);
        socket.off('chat:mentioned', handleMentioned);
        cancelled = true;
        disconnectSocket();
      };
    }

    return () => { cancelled = true; };
    // conversationKeyFor/showToast are stable enough in practice for this
    // listener's purposes and deliberately excluded — re-subscribing on
    // every conversations/roster update would drop and reattach the
    // socket listeners far more than needed. isOpen/activeKey/view/
    // nameById are all read via refs (see above) specifically so this
    // effect can stay mounted once without those reads going stale.
    // currentUserId is the one value this genuinely depends on identity-wise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== 'thread') return;
    const list = messageListRef.current;
    const nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 150;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadsByKey, activeKey, view]);

  // ── Online status refresh ────────────────────────────────────────────
  // Same GET /users/online this app's navbar "who's online" dropdown
  // uses, polled only while this panel is actually open — matching that
  // dropdown's own "no point polling when nobody's looking" reasoning.
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    const refreshOnline = async () => {
      try {
        const online = await usersAPI.getOnline();
        if (!cancelled) setOnlineIds(new Set(online.map(u => u._id)));
      } catch {
        // Leave whatever was last known — a failed refresh isn't worth
        // flickering everyone to "offline".
      }
    };
    refreshOnline();
    const interval = setInterval(refreshOnline, 15 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isOpen]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const openPanel = useCallback(() => {
    setIsOpen(true);
    if (!activeKey) setView('list');
  }, [activeKey]);

  const openConversation = useCallback(async (key, name) => {
    setActiveKey(key);
    setView('thread');
    setDraft('');
    setMentionedUserIds([]);

    setConversations(prev => prev.map(c => c.key === key ? { ...c, unreadCount: 0 } : c));
    chatAPI.markRead(key).catch(() => {});

    if (threadsByKey[key]?.loaded) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
      return;
    }

    setLoadingThread(true);
    try {
      const history = await chatAPI.getMessages(key);
      setThreadsByKey(prev => ({ ...prev, [key]: { messages: history, hasMore: history.length >= 50, loaded: true } }));
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
    } catch {
      setThreadsByKey(prev => ({ ...prev, [key]: { messages: [], hasMore: false, loaded: true } }));
    } finally {
      setLoadingThread(false);
    }
  }, [threadsByKey]);

  const startNewDM = useCallback((person) => {
    openConversation(person._id, person.name);
  }, [openConversation]);

  const backToList = useCallback(() => {
    setView('list');
    setActiveKey(null);
  }, []);

  const loadMore = useCallback(async () => {
    const thread = threadsByKey[activeKey];
    if (!thread || thread.messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const list = messageListRef.current;
    const prevScrollHeight = list?.scrollHeight || 0;
    try {
      const older = await chatAPI.getMessages(activeKey, thread.messages[0].createdAt);
      setThreadsByKey(prev => ({
        ...prev,
        [activeKey]: { messages: [...older, ...prev[activeKey].messages], hasMore: older.length >= 50, loaded: true }
      }));
      requestAnimationFrame(() => {
        if (list) list.scrollTop = list.scrollHeight - prevScrollHeight;
      });
    } catch {
      // Silent — "load earlier" can just be tried again.
    } finally {
      setLoadingMore(false);
    }
  }, [activeKey, threadsByKey, loadingMore]);

  // ── Composer: @mentions ────────────────────────────────────────────────
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.text.toLowerCase();
    return roster.filter(u => u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, roster]);

  const handleDraftChange = (e) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    setDraft(value);

    // Look backward from the cursor for an unclosed "@word" — the
    // standard trigger pattern (Slack/Discord/etc): an @ that isn't
    // immediately followed by whitespace and has no space between it and
    // the cursor yet.
    const uptoCursor = value.slice(0, cursor);
    const atMatch = uptoCursor.match(/@([^\s@]*)$/);
    setMentionQuery(atMatch ? { text: atMatch[1], start: cursor - atMatch[1].length - 1 } : null);
  };

  const selectMention = useCallback((person) => {
    if (mentionQuery === null) return;
    const before = draft.slice(0, mentionQuery.start);
    const after = draft.slice(mentionQuery.start + 1 + mentionQuery.text.length);
    const insertion = `@${person.name} `;
    setDraft(before + insertion + after);
    setMentionedUserIds(prev => prev.includes(person._id) ? prev : [...prev, person._id]);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = (before + insertion).length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }, [draft, mentionQuery]);

  // ── Composer: emoji ────────────────────────────────────────────────────
  const insertEmoji = useCallback((emoji) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }, [draft]);

  // ── Sending ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    const mentions = mentionedUserIds;
    setMentionedUserIds([]);
    try {
      // Not appended to the thread here — the server broadcasts it back
      // over the socket to everyone involved, including the sender's own
      // other tabs, so there's exactly one code path that adds a message
      // to any thread, rather than an optimistic local copy that could
      // end up duplicated or subtly out of order with the broadcast one.
      await chatAPI.sendMessage(text, {
        recipientId: activeKey === 'team' ? null : activeKey,
        mentionedUserIds: mentions
      });
    } catch {
      setDraft(text); // give the message back so it isn't lost
      setMentionedUserIds(mentions);
    } finally {
      setSending(false);
    }
  }, [draft, sending, activeKey, mentionedUserIds]);

  const toggleMute = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    setChatSoundMuted(next);
  };

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const activeThread = activeKey ? threadsByKey[activeKey] : null;
  const activeConversation = conversations.find(c => c.key === activeKey);
  const activeName = activeKey === 'team' ? 'Team Chat' : (activeConversation?.name || nameById.get(activeKey) || 'Direct Message');

  const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const formatConvoTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // People with no existing conversation — for starting a new DM.
  const startableRoster = roster.filter(p => !conversations.some(c => c.key === p._id));

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-5 left-5 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ height: '520px', maxHeight: '72vh' }}>
          {/* ── Header ── */}
          <div className="px-4 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {view === 'thread' && (
                <button onClick={backToList} aria-label="Back to conversations" className="text-white/80 hover:text-white -ml-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}
              <h3 className="text-sm font-bold text-white truncate">{view === 'thread' ? activeName : 'Chat'}</h3>
              {view === 'thread' && activeKey !== 'team' && (
                <span className={`text-[10px] shrink-0 ${onlineIds.has(activeKey) ? 'text-emerald-200' : 'text-white/50'}`}>
                  {onlineIds.has(activeKey) ? '● online' : 'offline'}
                </span>
              )}
              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-300' : 'bg-gray-300'}`} title={connected ? 'Connected' : 'Reconnecting…'} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={toggleMute} aria-label={soundMuted ? 'Unmute chat sound' : 'Mute chat sound'} title={soundMuted ? 'Sound muted' : 'Sound on'} className="text-white/80 hover:text-white">
                {soundMuted ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 9l4 4m0-4l-4 4" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                )}
              </button>
              <button onClick={() => setIsOpen(false)} aria-label="Close chat" className="text-white/80 hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* ── Conversation list ── */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto bg-gray-50">
              {loadingConversations ? (
                <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
              ) : (
                <>
                  {conversations.map(c => (
                    <button
                      key={c.key}
                      onClick={() => openConversation(c.key, c.name)}
                      className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-white flex items-center gap-3 transition-colors"
                    >
                      <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${c.key === 'team' ? 'bg-emerald-600' : 'bg-teal-600'}`}>
                          {c.key === 'team' ? '#' : c.name.charAt(0).toUpperCase()}
                        </div>
                        {c.key !== 'team' && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${onlineIds.has(c.key) ? 'bg-emerald-500' : 'bg-gray-300'}`}
                            title={onlineIds.has(c.key) ? 'Online' : 'Offline'}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                          <span className="text-[10px] text-gray-400 shrink-0">{formatConvoTime(c.lastMessageAt)}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{c.lastMessage || 'No messages yet'}</p>
                      </div>
                      {c.unreadCount > 0 && (
                        <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {c.unreadCount > 9 ? '9+' : c.unreadCount}
                        </span>
                      )}
                    </button>
                  ))}

                  {startableRoster.length > 0 && (
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Start a DM</p>
                    </div>
                  )}
                  {startableRoster.map(p => (
                    <button
                      key={p._id}
                      onClick={() => startNewDM(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-white flex items-center gap-3 transition-colors"
                    >
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${onlineIds.has(p._id) ? 'bg-emerald-500' : 'bg-gray-300'}`}
                          title={onlineIds.has(p._id) ? 'Online' : 'Offline'}
                        />
                      </div>
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <p className="text-sm text-gray-700 truncate">{p.name}</p>
                        {onlineIds.has(p._id) && <span className="text-[10px] text-emerald-600 font-medium shrink-0">online</span>}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Thread ── */}
          {view === 'thread' && (
            <>
              <div ref={messageListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50">
                {loadingThread ? (
                  <p className="text-xs text-gray-400 text-center py-6">Loading messages…</p>
                ) : (
                  <>
                    {activeThread?.hasMore && activeThread.messages.length > 0 && (
                      <div className="text-center">
                        <button onClick={loadMore} disabled={loadingMore} className="text-[11px] text-teal-600 hover:underline disabled:text-gray-400">
                          {loadingMore ? 'Loading…' : 'Load earlier messages'}
                        </button>
                      </div>
                    )}
                    {(!activeThread || activeThread.messages.length === 0) && (
                      <p className="text-xs text-gray-400 text-center py-6">No messages yet — say hello.</p>
                    )}
                    {activeThread?.messages.map((m) => {
                      const isMine = (m.senderId?._id || m.senderId) === currentUserId;
                      const mentionIds = (m.mentions || []).map(id => id?._id || id);
                      return (
                        <div key={m._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isMine ? 'bg-teal-600 text-white rounded-br-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'}`}>
                            {!isMine && activeKey === 'team' && <p className="text-[10px] font-bold text-teal-700 mb-0.5">{m.senderName}</p>}
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {renderMessageWithMentions(m.message, mentionIds, nameById, currentUserId)}
                            </p>
                            <p className={`text-[10px] mt-1 ${isMine ? 'text-teal-100' : 'text-gray-400'}`}>{formatTime(m.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              {/* ── Composer ── */}
              <div className="relative shrink-0">
                {mentionQuery !== null && mentionMatches.length > 0 && (
                  <div className="absolute bottom-full left-2 right-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                    {mentionMatches.map(p => (
                      <button
                        key={p._id}
                        onClick={() => selectMention(p)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                      >
                        <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}

                {showEmojiPicker && (
                  <div className="absolute bottom-full left-2 right-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 max-h-48 overflow-y-auto">
                    {EMOJI_GROUPS.map(group => (
                      <div key={group.label} className="mb-2 last:mb-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{group.label}</p>
                        <div className="grid grid-cols-8 gap-1">
                          {group.emojis.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => insertEmoji(emoji)}
                              className="text-lg hover:bg-gray-100 rounded p-1"
                              type="button"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSend} className="p-2.5 border-t border-gray-100 flex items-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setShowEmojiPicker(v => !v); setMentionQuery(null); }}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    aria-label="Insert emoji"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={handleDraftChange}
                    onKeyDown={(e) => {
                      if (mentionQuery !== null && mentionMatches.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                        e.preventDefault();
                        selectMention(mentionMatches[0]);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
                      if (e.key === 'Escape') setMentionQuery(null);
                    }}
                    placeholder={activeKey === 'team' ? 'Message the team… (@ to mention)' : `Message ${activeName}…`}
                    rows={1}
                    className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 max-h-24"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                    aria-label="Send message"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {!isOpen && (
        <button
          onClick={openPanel}
          className="fixed bottom-5 left-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 shadow-xl flex items-center justify-center hover:shadow-2xl transition-shadow"
          aria-label={totalUnread > 0 ? `Open chat — ${totalUnread} unread` : 'Open chat'}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}
    </>
  );
}