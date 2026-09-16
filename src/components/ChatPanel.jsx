import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI } from '../utils/api';
import { connectSocket, disconnectSocket } from '../utils/socket';

// Floating team-chat panel, scoped to Secretariat + Admin (same audience
// as the "who's online" list this was built alongside). Real-time
// delivery uses Socket.IO — a WebSocket, not polling — since polling a
// chat feature is exactly the anti-pattern "industry standard" chat
// implementations avoid: it's higher latency, wastes requests when
// nothing's been said, and doesn't scale the way a persistent connection
// does. Sending still goes over plain REST (POST /chat/messages), which
// then broadcasts to every connected socket — see server/lib/socket.js
// for why that split is deliberate, not a shortcut.
export default function ChatPanel({ currentUserId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const isOpenRef = useRef(isOpen);
  const messageListRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // Initial history load + socket connection — once per mount. This
  // component is only rendered while the Secretariat tab is showing (see
  // SecretariatView.jsx), so navigating away and back reconnects; that's
  // an acceptable trade-off for this feature's scope — messages are never
  // lost either way, since history is always re-fetched from the
  // database on reconnect, just not delivered live while away.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const history = await chatAPI.getMessages();
        if (!cancelled) {
          setMessages(history);
          setHasMore(history.length >= 50);
        }
      } catch {
        // Leave the panel usable even if history fails to load once —
        // new messages will still arrive live once the socket connects.
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();

    const socket = connectSocket();
    if (socket) {
      const handleConnect = () => setConnected(true);
      const handleDisconnect = () => setConnected(false);
      const handleNewMessage = (message) => {
        setMessages(prev => [...prev, message]);
        if (!isOpenRef.current) setUnreadCount(prev => prev + 1);
      };

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('chat:new-message', handleNewMessage);
      setConnected(socket.connected);

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('chat:new-message', handleNewMessage);
        cancelled = true;
        disconnectSocket();
      };
    }

    return () => { cancelled = true; };
  }, []);

  // Auto-scroll to the newest message — but only when already near the
  // bottom (or on first open), so scrolling up to read history doesn't
  // get yanked back down every time someone else sends a message.
  useEffect(() => {
    if (!isOpen) return;
    const list = messageListRef.current;
    const nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 150;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const openPanel = useCallback(() => {
    setIsOpen(true);
    setUnreadCount(0);
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
  }, []);

  const loadMore = useCallback(async () => {
    if (messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const list = messageListRef.current;
    const prevScrollHeight = list?.scrollHeight || 0;
    try {
      const older = await chatAPI.getMessages(messages[0].createdAt);
      setMessages(prev => [...older, ...prev]);
      setHasMore(older.length >= 50);
      // Keep the view anchored on what was already visible, rather than
      // jumping to the top of the newly-loaded history.
      requestAnimationFrame(() => {
        if (list) list.scrollTop = list.scrollHeight - prevScrollHeight;
      });
    } catch {
      // Silent — the person can just try "load earlier" again.
    } finally {
      setLoadingMore(false);
    }
  }, [messages, loadingMore]);

  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      // Not appended to `messages` here — the server broadcasts it back
      // over the socket to everyone including the sender (see
      // POST /chat/messages), so there's exactly one code path that adds
      // a message to the list, rather than an optimistic local copy that
      // could end up duplicated or subtly out of order with the
      // broadcast version.
      await chatAPI.sendMessage(text);
    } catch (err) {
      setDraft(text); // give the message back so it isn't lost
    } finally {
      setSending(false);
    }
  }, [draft, sending]);

  const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-5 left-5 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ height: '480px', maxHeight: '70vh' }}>
          <div className="px-4 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm font-bold text-white">Team Chat</h3>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-300' : 'bg-gray-300'}`} title={connected ? 'Connected' : 'Reconnecting…'} />
            </div>
            <button onClick={() => setIsOpen(false)} aria-label="Close chat" className="text-white/80 hover:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div ref={messageListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50">
            {loadingHistory ? (
              <p className="text-xs text-gray-400 text-center py-6">Loading messages…</p>
            ) : (
              <>
                {hasMore && messages.length > 0 && (
                  <div className="text-center">
                    <button onClick={loadMore} disabled={loadingMore} className="text-[11px] text-teal-600 hover:underline disabled:text-gray-400">
                      {loadingMore ? 'Loading…' : 'Load earlier messages'}
                    </button>
                  </div>
                )}
                {messages.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">No messages yet — say hello.</p>
                )}
                {messages.map((m) => {
                  const isMine = m.senderId === currentUserId || m.senderId?._id === currentUserId;
                  return (
                    <div key={m._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isMine ? 'bg-teal-600 text-white rounded-br-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'}`}>
                        {!isMine && <p className="text-[10px] font-bold text-teal-700 mb-0.5">{m.senderName}</p>}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                        <p className={`text-[10px] mt-1 ${isMine ? 'text-teal-100' : 'text-gray-400'}`}>{formatTime(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          <form onSubmit={handleSend} className="p-2.5 border-t border-gray-100 flex items-end gap-2 shrink-0">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
              }}
              placeholder="Message the team…"
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
      )}

      {!isOpen && (
        <button
          onClick={openPanel}
          className="fixed bottom-5 left-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 shadow-xl flex items-center justify-center hover:shadow-2xl transition-shadow"
          aria-label={unreadCount > 0 ? `Open team chat — ${unreadCount} unread` : 'Open team chat'}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}
    </>
  );
}