import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Phone, Search, Send, Video, X } from "lucide-react";
import PageHeading from "../components/PageHeading";
import { apiRequest, type AppRole, type CurrentUser } from "../lib/api";
import { supabase } from "../lib/supabase";
import { roleLabel } from "../lib/roles";
import { useInAppCalls } from "../components/InAppCalls";
import "./../css/OperationsPages.css";

interface ChatPerson {
  id: string;
  name: string;
  role: AppRole;
  departmentName: string;
}

interface ChatConversation {
  id: string;
  peer: { id: string; name: string; role: AppRole };
  lastMessage: string;
  lastMessageAt: string;
  lastMessageFromMe: boolean;
  unreadCount: number;
  lastReadAt: string | null;
}

interface ChatMessage {
  id: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
  fromMe: boolean;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export default function ChatPage({ user }: { user: CurrentUser }) {
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showCallPicker, setShowCallPicker] = useState(false);
  const [selectedCallPeople, setSelectedCallPeople] = useState<string[]>([]);
  const [startingCall, setStartingCall] = useState(false);
  const [pageError, setPageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [startingPersonId, setStartingPersonId] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageRequestId = useRef(0);
  const { startCall } = useInAppCalls();

  const loadConversations = useCallback(async () => {
    try {
      const result = await apiRequest<{ conversations: ChatConversation[] }>("/api/v1/chat/conversations");
      setConversations(result.conversations);
      setPageError("");
      setConversationId((current) => current ?? result.conversations[0]?.id ?? null);
    } catch (error: unknown) {
      console.error("Could not load chat conversations.", error);
      setPageError(error instanceof Error ? error.message : "We couldn't load your conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (id: string, showLoading: boolean) => {
    const requestId = ++messageRequestId.current;
    if (showLoading) setMessagesLoading(true);
    try {
      const result = await apiRequest<{ messages: ChatMessage[] }>(`/api/v1/chat/conversations/${id}/messages`);
      if (requestId !== messageRequestId.current) return;
      setMessages(result.messages);
      setPageError("");
    } catch (error: unknown) {
      if (requestId !== messageRequestId.current) return;
      console.error("Could not load chat messages.", error);
      setPageError(error instanceof Error ? error.message : "We couldn't load this conversation.");
    } finally {
      if (showLoading && requestId === messageRequestId.current) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      apiRequest<{ people: ChatPerson[] }>("/api/v1/chat/people"),
      apiRequest<{ conversations: ChatConversation[] }>("/api/v1/chat/conversations"),
    ]).then(([peopleResult, conversationResult]) => {
      if (!active) return;
      setPeople(peopleResult.people);
      setConversations(conversationResult.conversations);
      setConversationId((current) => current ?? conversationResult.conversations[0]?.id ?? null);
    }).catch((error: unknown) => {
      console.error("Could not initialize staff chat.", error);
      if (active) setPageError(error instanceof Error ? error.message : "We couldn't connect to staff chat.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const realtime = supabase;
    if (!realtime) return;
    const channel = realtime.channel(`chat-participants-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_conversation_participants",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        void loadConversations();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Could not subscribe to real-time chat conversation updates.", status);
        }
      });
    return () => { void realtime.removeChannel(channel); };
  }, [loadConversations, user.id]);

  useEffect(() => {
    if (!conversationId) {
      messageRequestId.current += 1;
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    const realtime = supabase;
    setMessages([]);
    void loadMessages(conversationId, true);
    if (!realtime) return;
    const channel = realtime.channel(`chat-messages-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        void loadMessages(conversationId, false);
        void loadConversations();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Could not subscribe to real-time chat messages.", status);
        }
      });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadMessages(conversationId, false);
        void loadConversations();
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void realtime.removeChannel(channel);
    };
  }, [conversationId, loadConversations, loadMessages]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const activeConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null;
  const filteredConversations = useMemo(() => {
    const search = conversationSearch.trim().toLocaleLowerCase();
    return conversations.filter((conversation) => !search || conversation.peer.name.toLocaleLowerCase().includes(search));
  }, [conversationSearch, conversations]);
  const filteredPeople = useMemo(() => {
    const search = peopleSearch.trim().toLocaleLowerCase();
    return people.filter((person) => !search || `${person.name} ${person.departmentName} ${roleLabel(person.role)}`.toLocaleLowerCase().includes(search));
  }, [people, peopleSearch]);

  async function startCallWith(participantIds: string[], mediaMode: "audio" | "video") {
    setStartingCall(true);
    setPageError("");
    try {
      await startCall(participantIds, mediaMode);
      setShowCallPicker(false);
      setSelectedCallPeople([]);
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : "We couldn't start this call.");
    } finally {
      setStartingCall(false);
    }
  }

  async function startConversation(person: ChatPerson) {
    setStartingPersonId(person.id);
    setPageError("");
    try {
      const result = await apiRequest<{ conversationId: string }>("/api/v1/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: person.id }),
      });
      setConversationId(result.conversationId);
      setShowNewConversation(false);
      setPeopleSearch("");
      await loadConversations();
    } catch (error: unknown) {
      console.error("Could not start chat conversation.", error);
      setPageError(error instanceof Error ? error.message : "We couldn't start that conversation.");
    } finally {
      setStartingPersonId(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = messageText.trim();
    if (!conversationId || !body || sending) return;
    setSending(true);
    setPageError("");
    try {
      const result = await apiRequest<{ message: ChatMessage }>(`/api/v1/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setMessages((current) => current.some((message) => message.id === result.message.id) ? current : [...current, result.message]);
      setMessageText("");
      await loadConversations();
    } catch (error: unknown) {
      console.error("Could not send chat message.", error);
      setPageError(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading
        title="Chat"
        description="Message colleagues, or start private voice and video calls with one or more people."
      />
      {pageError && <div className="alert alert--error" role="alert">{pageError}</div>}
      <div className="chat-call-actions">
        <button className="button button--outline" type="button" onClick={() => { setShowNewConversation((show) => !show); setShowCallPicker(false); setPageError(""); }}>
          <MessageCircle size={15} />{showNewConversation ? "Conversations" : "New message"}
        </button>
        <button className="button button--outline" type="button" onClick={() => { setShowCallPicker((show) => !show); setShowNewConversation(false); setSelectedCallPeople([]); setPageError(""); }}>
          {showCallPicker ? <X size={15} /> : <Phone size={15} />}{showCallPicker ? "Close call setup" : "New group call"}
        </button>
      </div>
      <div className="surface-card chat-layout">
        <aside className="chat-conversations" aria-label={showNewConversation ? "Start a conversation" : "Conversations"}>
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label={showNewConversation || showCallPicker ? "Search colleagues" : "Search conversations"}
              value={showNewConversation || showCallPicker ? peopleSearch : conversationSearch}
              onChange={(event) => showNewConversation || showCallPicker ? setPeopleSearch(event.target.value) : setConversationSearch(event.target.value)}
              placeholder={showNewConversation || showCallPicker ? "Find a colleague…" : "Search conversations…"}
            />
          </label>
          {showCallPicker ? (
            <div className="chat-list-scroll">
              <p className="call-picker__hint">Select one or more colleagues for a private group call. Calls are limited to eight people total.</p>
              {!filteredPeople.length && <p className="empty-state">No active colleagues are available to call.</p>}
              {filteredPeople.map((person) => (
                <label className="conversation-row call-picker__person" key={person.id}>
                  <input
                    type="checkbox"
                    checked={selectedCallPeople.includes(person.id)}
                    disabled={!selectedCallPeople.includes(person.id) && selectedCallPeople.length >= 7}
                    onChange={(event) => setSelectedCallPeople((current) => event.target.checked
                      ? [...current, person.id]
                      : current.filter((id) => id !== person.id))}
                  />
                  <span className="initial-avatar">{initials(person.name)}</span>
                  <span className="record-row__main"><strong>{person.name}</strong><small>{person.departmentName} · {roleLabel(person.role)}</small></span>
                </label>
              ))}
              <div className="call-picker__actions">
                <button className="button button--outline" type="button" disabled={!selectedCallPeople.length || startingCall} onClick={() => void startCallWith(selectedCallPeople, "audio")}><Phone size={15} />Voice call</button>
                <button className="button button--primary" type="button" disabled={!selectedCallPeople.length || startingCall} onClick={() => void startCallWith(selectedCallPeople, "video")}><Video size={15} />Video call</button>
              </div>
            </div>
          ) : showNewConversation ? (
            <div className="chat-list-scroll">
              {!filteredPeople.length && <p className="empty-state">{people.length ? "No colleagues match that search." : "No active colleagues are available to message."}</p>}
              {filteredPeople.map((person) => (
                <button className="conversation-row" key={person.id} onClick={() => void startConversation(person)} disabled={startingPersonId !== null}>
                  <span className="initial-avatar">{initials(person.name)}</span>
                  <span className="record-row__main"><strong>{person.name}</strong><small>{person.departmentName} · {roleLabel(person.role)}</small></span>
                  {startingPersonId === person.id && <span className="conversation-row__time">Opening…</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="chat-list-scroll">
              {loading && <p className="empty-state">Loading conversations…</p>}
              {!loading && !filteredConversations.length && <p className="empty-state">{conversations.length ? "No conversations match that search." : "Start a conversation with a colleague or administrator."}</p>}
              {filteredConversations.map((conversation) => (
                <button
                  className={`conversation-row${conversation.id === conversationId ? " conversation-row--active" : ""}`}
                  key={conversation.id}
                  onClick={() => { setConversationId(conversation.id); setShowNewConversation(false); }}
                >
                  <span className="initial-avatar">{initials(conversation.peer.name)}</span>
                  <span className="record-row__main"><strong>{conversation.peer.name}</strong><small>{conversation.lastMessage ? `${conversation.lastMessageFromMe ? "You: " : ""}${conversation.lastMessage}` : roleLabel(conversation.peer.role)}</small></span>
                  <span className="conversation-row__meta"><time className="conversation-row__time">{formatTime(conversation.lastMessageAt)}</time>{conversation.unreadCount > 0 && <span className="chat-unread-count">{conversation.unreadCount}</span>}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="chat-thread" aria-label={activeConversation ? `Conversation with ${activeConversation.peer.name}` : "Conversation"}>
          {activeConversation ? (
            <>
              <header className="chat-thread__heading">
                <span className="initial-avatar">{initials(activeConversation.peer.name)}</span>
                <div><strong>{activeConversation.peer.name}</strong><small>{roleLabel(activeConversation.peer.role)}</small></div>
                <div className="chat-thread__call-actions">
                  <button className="button button--outline" type="button" aria-label={`Voice call ${activeConversation.peer.name}`} title="Voice call" disabled={startingCall} onClick={() => void startCallWith([activeConversation.peer.id], "audio")}><Phone size={16} /></button>
                  <button className="button button--outline" type="button" aria-label={`Video call ${activeConversation.peer.name}`} title="Video call" disabled={startingCall} onClick={() => void startCallWith([activeConversation.peer.id], "video")}><Video size={16} /></button>
                </div>
              </header>
              <div className="message-list" ref={messageListRef} aria-live="polite">
                {messagesLoading && !messages.length && <p className="empty-state">Loading messages…</p>}
                {!messagesLoading && !messages.length && <p className="empty-state">This is the start of your conversation with {activeConversation.peer.name}.</p>}
                {messages.map((message) => (
                  <article className={`chat-bubble ${message.fromMe ? "chat-bubble--mine" : "chat-bubble--other"}`} key={message.id}>
                    {!message.fromMe && <small>{message.senderName}</small>}
                    <p>{message.body}</p>
                    <time>{formatTime(message.createdAt)}</time>
                  </article>
                ))}
              </div>
              <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}>
                <input
                  aria-label="Write a message"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Write a message…"
                  maxLength={4000}
                  disabled={sending}
                />
                <button type="submit" aria-label="Send message" disabled={!messageText.trim() || sending}>
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty-state">
              <span className="task-icon task-icon--blue"><MessageCircle size={20} /></span>
              <h2>{showNewConversation ? "Choose a colleague" : "Your conversations"}</h2>
              <p>{showNewConversation ? "Search for an active colleague or administrator to start a private chat." : "Select a conversation or start a new message with someone on your team."}</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
