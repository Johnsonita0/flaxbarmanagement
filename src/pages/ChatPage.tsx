import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, MessageCircle, Mic, Pause, Phone, PhoneOff, Play, Search, Send, Video, X } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import PageHeading from "../components/PageHeading";
import { useToast } from "../components/ToastProvider";
import { apiRequest, getProfilePhotoUrl, type AppRole, type CurrentUser } from "../lib/api";
import { supabase } from "../lib/supabase";
import { roleLabel } from "../lib/roles";
import { useInAppCalls } from "../components/InAppCalls";
import "./../css/OperationsPages.css";

interface ChatPerson {
  id: string;
  name: string;
  role: AppRole;
  departmentName: string;
  avatarPath: string | null;
}

interface ChatConversation {
  id: string;
  peer: { id: string; name: string; role: AppRole; avatarPath: string | null };
  lastMessage: string;
  lastMessageAt: string;
  lastMessageFromMe: boolean;
  lastMessageDeliveredAt: string | null;
  unreadCount: number;
  lastReadAt: string | null;
}

interface ChatMessage {
  id: string;
  senderId: string | null;
  senderName: string;
  senderAvatarPath: string | null;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  fromMe: boolean;
}

interface ChatTypingPresence {
  userId: string;
  name: string;
  typing: boolean;
}

type CallHistory =
  | { status: "missed"; mode: "audio" | "video" }
  | { status: "declined"; mode: "audio" | "video" }
  | { status: "ended"; mode: "audio" | "video"; durationSeconds: number };

const voiceMessagePrefix = "__flexbar_voice_message__:";
const voiceMessagePathPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12})\.(webm|ogg|m4a)$/i;
const maxVoiceMessageSeconds = 120;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("");
}

function ChatAvatar({ name, avatarPath }: { name: string; avatarPath: string | null }) {
  const photoUrl = getProfilePhotoUrl(avatarPath);
  return (
    <span className="initial-avatar chat-avatar">
      {photoUrl ? <img src={photoUrl} alt="" /> : initials(name)}
    </span>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function getCallHistory(body: string): CallHistory | null {
  const missed = /^__flexbar_missed_call__:(audio|video):[0-9a-f-]{36}$/i.exec(body);
  if (missed?.[1] === "audio" || missed?.[1] === "video") {
    return { status: "missed", mode: missed[1] };
  }
  const declined = /^__flexbar_call_declined__:(audio|video):[0-9a-f-]{36}$/i.exec(body);
  if (declined?.[1] === "audio" || declined?.[1] === "video") {
    return { status: "declined", mode: declined[1] };
  }
  const ended = /^__flexbar_call_ended__:(audio|video):[0-9a-f-]{36}:(\d+)$/i.exec(body);
  if ((ended?.[1] === "audio" || ended?.[1] === "video") && ended[2]) {
    const durationSeconds = Number(ended[2]);
    if (Number.isSafeInteger(durationSeconds)) {
      return { status: "ended", mode: ended[1], durationSeconds };
    }
  }
  return null;
}

function isInternalCallHistory(body: string) {
  return body.startsWith("__flexbar_missed_call__:") ||
    body.startsWith("__flexbar_call_declined__:") ||
    body.startsWith("__flexbar_call_ended__:");
}

function isVoiceMessage(body: string) {
  return body.startsWith(voiceMessagePrefix);
}

function formatCallDuration(durationSeconds: number) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  if (!minutes) return `${seconds} sec`;
  return `${minutes} min${seconds ? ` ${seconds} sec` : ""}`;
}

function getVoiceMessagePath(body: string) {
  if (!body.startsWith(voiceMessagePrefix)) return null;
  const path = body.slice(voiceMessagePrefix.length);
  return voiceMessagePathPattern.test(path) ? path : null;
}

function VoiceMessage({ path }: { path: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let active = true;
    setAudioUrl(null);
    setError("");
    if (!supabase) {
      setError("Voice messages are unavailable because chat storage is not configured.");
      return () => { active = false; };
    }
    void supabase.storage.from("chat-voice-messages").createSignedUrl(path, 60 * 60)
      .then(({ data, error: signedUrlError }) => {
        if (signedUrlError) throw signedUrlError;
        if (!data?.signedUrl) throw new Error("The voice message link was not returned.");
        if (active) setAudioUrl(data.signedUrl);
      })
      .catch((loadError: unknown) => {
        console.error("Could not load a chat voice message.", loadError);
        if (active) setError("This voice message could not be loaded.");
      });
    return () => { active = false; };
  }, [path]);

  const displayDuration = duration || currentTime;
  const progress = duration > 0 ? currentTime / duration : 0;
  return (
    <div className="chat-voice-message">
      <button
        type="button"
        className="chat-voice-message__play"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        disabled={!audioUrl}
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) {
            void audio.play().catch((playError: unknown) => {
              console.error("Could not play a chat voice message.", playError);
              setError("This voice message could not be played.");
            });
          } else {
            audio.pause();
          }
        }}
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      {audioUrl ? (
        <>
          <audio
            ref={audioRef}
            preload="metadata"
            src={audioUrl}
            onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setCurrentTime(0); }}
            onError={() => setError("This voice message could not be played.")}
          />
          <div className="chat-voice-message__track" aria-label="Voice message audio">
            <div className="chat-voice-message__waveform" aria-hidden="true">
              {Array.from({ length: 36 }, (_, index) => {
                const height = 20 + ((index * 17 + 13) % 67);
                return <span key={index} className={index / 36 <= progress ? "is-played" : ""} style={{ height: `${height}%` }} />;
              })}
            </div>
            <small>{formatCallDuration(Math.floor(displayDuration))}</small>
          </div>
        </>
      ) : (
        <span role={error ? "alert" : "status"}>{error || "Loading voice message…"}</span>
      )}
    </div>
  );
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
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingAmplitude, setRecordingAmplitude] = useState(0.08);
  const [startingPersonId, setStartingPersonId] = useState<string | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [typingChannelReady, setTypingChannelReady] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageRequestId = useRef(0);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const sendVoiceOnStopRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnimationRef = useRef<number | null>(null);
  const { startCall } = useInAppCalls();
  const { showToast } = useToast();

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
        event: "*",
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
    const realtime = supabase;
    setTypingNames([]);
    setTypingChannelReady(false);
    if (!realtime || !conversationId) return;

    const channel = realtime.channel(`chat-typing:${conversationId}`, {
      config: { private: true, presence: { key: user.id } },
    });
    const updateTypingNames = () => {
      const presence = channel.presenceState<ChatTypingPresence>();
      const names = Object.values(presence)
        .flat()
        .filter((item) => item.userId !== user.id && item.typing)
        .map((item) => item.name);
      setTypingNames([...new Set(names)]);
    };
    channel.on("presence", { event: "sync" }, updateTypingNames);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        typingChannelRef.current = channel;
        setTypingChannelReady(true);
        void channel.track({
          userId: user.id,
          name: user.displayName?.trim() || "Team member",
          typing: false,
        }).then((result) => {
          if (result !== "ok") console.error("Could not initialize chat typing presence.", result);
        });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Could not subscribe to chat typing presence.", status);
      }
    });

    return () => {
      if (typingChannelRef.current === channel) typingChannelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      void realtime.removeChannel(channel);
    };
  }, [conversationId, user.displayName, user.id]);

  useEffect(() => {
    const channel = typingChannelRef.current;
    if (!channel || !typingChannelReady) return;
    const typing = Boolean(messageText.trim());
    void channel.track({
      userId: user.id,
      name: user.displayName?.trim() || "Team member",
      typing,
    }).then((result) => {
      if (result !== "ok") console.error("Could not update chat typing presence.", result);
    });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (typing) {
      typingTimeoutRef.current = setTimeout(() => {
        const activeChannel = typingChannelRef.current;
        if (activeChannel) {
          void activeChannel.track({
            userId: user.id,
            name: user.displayName?.trim() || "Team member",
            typing: false,
          }).then((result) => {
            if (result !== "ok") console.error("Could not clear chat typing presence.", result);
          });
        }
      }, 2500);
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [messageText, typingChannelReady, user.displayName, user.id]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!recordingVoice) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
      setRecordingSeconds(elapsed);
      if (elapsed >= maxVoiceMessageSeconds) stopVoiceRecording(true);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recordingVoice]);

  useEffect(() => () => {
    const recorder = voiceRecorderRef.current;
    sendVoiceOnStopRef.current = false;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordingAnimationRef.current !== null) cancelAnimationFrame(recordingAnimationRef.current);
    if (recordingAudioContextRef.current && recordingAudioContextRef.current.state !== "closed") {
      void recordingAudioContextRef.current.close();
    }
    voiceRecorderRef.current = null;
    voiceStreamRef.current = null;
    recordingAudioContextRef.current = null;
  }, [conversationId]);

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
      setMessageText("");
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
      const result = await apiRequest<{ message: ChatMessage; notificationWarning: boolean }>(`/api/v1/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setMessages((current) => current.some((message) => message.id === result.message.id) ? current : [...current, result.message]);
      setMessageText("");
      if (result.notificationWarning) {
        showToast("Your message was sent, but the recipient notification could not be delivered.", "error");
      }
      const channel = typingChannelRef.current;
      if (channel) {
        void channel.track({ userId: user.id, name: user.displayName?.trim() || "Team member", typing: false })
          .then((status) => {
            if (status !== "ok") console.error("Could not clear chat typing presence after sending.", status);
          });
      }
      await loadConversations();
    } catch (error: unknown) {
      console.error("Could not send chat message.", error);
      setPageError(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function sendVoiceMessage(blob: Blob, contentType: string, extension: string) {
    if (!conversationId || !supabase || sendingVoice) return;
    if (!blob.size) {
      setPageError("The recording was empty. Please record your voice message again.");
      return;
    }
    if (blob.size > 15 * 1024 * 1024) {
      setPageError("This voice message is too large to send. Please record a shorter message.");
      return;
    }
    const targetConversationId = conversationId;
    const objectPath = `${targetConversationId}/${user.id}/${crypto.randomUUID()}.${extension}`;
    setSendingVoice(true);
    setPageError("");
    let uploaded = false;
    try {
      const { error: uploadError } = await supabase.storage.from("chat-voice-messages").upload(objectPath, blob, {
        contentType,
        upsert: false,
      });
      if (uploadError) throw new Error("The voice message could not be uploaded. Please try again.");
      uploaded = true;
      const result = await apiRequest<{ message: ChatMessage; notificationWarning: boolean }>(
        `/api/v1/chat/conversations/${targetConversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ body: `${voiceMessagePrefix}${objectPath}` }),
        },
      );
      setMessages((current) => current.some((message) => message.id === result.message.id)
        ? current
        : [...current, result.message]);
      if (result.notificationWarning) {
        showToast("Your voice message was sent, but the recipient notification could not be delivered.", "error");
      }
      await loadConversations();
    } catch (error: unknown) {
      console.error("Could not send chat voice message.", error);
      if (uploaded) {
        const { error: cleanupError } = await supabase.storage.from("chat-voice-messages").remove([objectPath]);
        if (cleanupError) console.error("Could not remove a voice upload after its message failed to send.", cleanupError);
      }
      setPageError(error instanceof Error ? error.message : "Your voice message could not be sent.");
    } finally {
      setSendingVoice(false);
    }
  }

  async function startVoiceRecording() {
    if (!conversationId || recordingVoice || sendingVoice || sending) return;
    setPageError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setPageError("Voice recording is not supported by this browser. Try a current version of Chrome, Edge, or Safari.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const updateWaveform = () => {
        analyser.getByteTimeDomainData(samples);
        const sum = samples.reduce((total, sample) => total + ((sample - 128) / 128) ** 2, 0);
        setRecordingAmplitude(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        recordingAnimationRef.current = requestAnimationFrame(updateWaveform);
      };
      recordingAudioContextRef.current = audioContext;
      updateWaveform();
      const formats = [
        { mimeType: "audio/webm;codecs=opus", extension: "webm" },
        { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
        { mimeType: "audio/mp4", extension: "m4a" },
        { mimeType: "audio/webm", extension: "webm" },
        { mimeType: "audio/ogg", extension: "ogg" },
      ];
      const format = formats.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType));
      const recorder = format
        ? new MediaRecorder(stream, { mimeType: format.mimeType })
        : new MediaRecorder(stream);
      const contentType = (recorder.mimeType || format?.mimeType || "audio/webm").split(";")[0] ?? "audio/webm";
      const extension = format?.extension ?? (contentType === "audio/mp4" ? "m4a" : contentType === "audio/ogg" ? "ogg" : "webm");
      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      sendVoiceOnStopRef.current = false;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) voiceChunksRef.current.push(event.data);
      });
      recorder.addEventListener("error", () => {
        sendVoiceOnStopRef.current = false;
        setPageError("Recording failed. Please check microphone access and try again.");
        if (recorder.state !== "inactive") recorder.stop();
      });
      recorder.addEventListener("stop", () => {
        const chunks = voiceChunksRef.current;
        voiceChunksRef.current = [];
        const shouldSend = sendVoiceOnStopRef.current;
        sendVoiceOnStopRef.current = false;
        voiceRecorderRef.current = null;
        voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        if (recordingAnimationRef.current !== null) cancelAnimationFrame(recordingAnimationRef.current);
        recordingAnimationRef.current = null;
        if (recordingAudioContextRef.current && recordingAudioContextRef.current.state !== "closed") {
          void recordingAudioContextRef.current.close();
        }
        recordingAudioContextRef.current = null;
        setRecordingVoice(false);
        setRecordingSeconds(0);
        setRecordingAmplitude(0.08);
        if (shouldSend && chunks.length) {
          void sendVoiceMessage(new Blob(chunks, { type: contentType }), contentType, extension);
        }
      });
      recorder.start(250);
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setRecordingVoice(true);
    } catch (error: unknown) {
      stream?.getTracks().forEach((track) => track.stop());
      if (recordingAnimationRef.current !== null) cancelAnimationFrame(recordingAnimationRef.current);
      recordingAnimationRef.current = null;
      if (recordingAudioContextRef.current && recordingAudioContextRef.current.state !== "closed") {
        void recordingAudioContextRef.current.close();
      }
      recordingAudioContextRef.current = null;
      console.error("Could not start chat voice recording.", error);
      setPageError(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow microphone access in your browser, then try again."
        : error instanceof Error ? error.message : "The voice recording could not start.");
    }
  }

  function stopVoiceRecording(shouldSend: boolean) {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    sendVoiceOnStopRef.current = shouldSend;
    recorder.stop();
  }

  function formatRecordingTime(seconds: number) {
    return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
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
                  <ChatAvatar name={person.name} avatarPath={person.avatarPath} />
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
                  <ChatAvatar name={person.name} avatarPath={person.avatarPath} />
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
                  onClick={() => { setConversationId(conversation.id); setMessageText(""); setShowNewConversation(false); }}
                >
                  <ChatAvatar name={conversation.peer.name} avatarPath={conversation.peer.avatarPath} />
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
                <ChatAvatar name={activeConversation.peer.name} avatarPath={activeConversation.peer.avatarPath} />
                <div className="chat-thread__peer"><strong>{activeConversation.peer.name}</strong><small>{roleLabel(activeConversation.peer.role)}</small></div>
                <div className="chat-thread__call-actions">
                  <button className="button button--outline" type="button" aria-label={`Voice call ${activeConversation.peer.name}`} title="Voice call" disabled={startingCall} onClick={() => void startCallWith([activeConversation.peer.id], "audio")}><Phone size={16} /></button>
                  <button className="button button--outline" type="button" aria-label={`Video call ${activeConversation.peer.name}`} title="Video call" disabled={startingCall} onClick={() => void startCallWith([activeConversation.peer.id], "video")}><Video size={16} /></button>
                </div>
              </header>
              <div className="message-list" ref={messageListRef} aria-live="polite">
                {messagesLoading && !messages.length && <p className="empty-state">Loading messages…</p>}
                {!messagesLoading && !messages.length && <p className="empty-state">This is the start of your conversation with {activeConversation.peer.name}.</p>}
                {messages.map((message) => {
                  const callHistory = getCallHistory(message.body);
                  const voiceMessagePath = getVoiceMessagePath(message.body);
                  const voiceMessage = isVoiceMessage(message.body);
                  return (
                    <article className={`chat-bubble ${message.fromMe ? "chat-bubble--mine" : "chat-bubble--other"}`} key={message.id}>
                      {voiceMessage ? (
                        voiceMessagePath
                          ? <VoiceMessage path={voiceMessagePath} />
                          : <div className="chat-voice-message chat-voice-message--error"><Mic size={15} /><span role="alert">This voice message could not be loaded.</span></div>
                      ) : callHistory ? (
                        <div className={`chat-call-history${callHistory.status === "ended" ? " chat-call-history--ended" : ""}`}>
                          <p>
                            {callHistory.status === "ended" ? <Phone size={14} /> : <PhoneOff size={14} />}
                            {callHistory.status === "missed"
                              ? `Missed ${callHistory.mode === "video" ? "video" : "voice"} call`
                              : callHistory.status === "declined"
                                ? `${message.fromMe ? "You declined" : `${activeConversation.peer.name} declined your`} ${callHistory.mode === "video" ? "video" : "voice"} call`
                                : `${callHistory.mode === "video" ? "Video" : "Voice"} call ended · ${formatCallDuration(callHistory.durationSeconds)}`}
                          </p>
                          {callHistory.status !== "ended" && (
                            <button type="button" disabled={startingCall} onClick={() => void startCallWith([activeConversation.peer.id], callHistory.mode)}>
                              <Phone size={13} />Call back
                            </button>
                          )}
                        </div>
                      ) : isInternalCallHistory(message.body)
                        ? <div className="chat-call-history"><p><Phone size={14} />Call history</p></div>
                        : <p>{message.body}</p>}
                      <div className="chat-bubble__meta">
                        <time>{formatTime(message.createdAt)}</time>
                        {message.fromMe && (message.deliveredAt
                          ? <CheckCheck className="chat-message-receipt chat-message-receipt--delivered" size={13} aria-label="Delivered" />
                          : <Check className="chat-message-receipt" size={13} aria-label="Sent" />)}
                      </div>
                    </article>
                  );
                })}
              </div>
              {typingNames.length > 0 && (
                <p className="chat-typing-indicator" aria-live="polite">
                  {typingNames.length === 1 ? `${typingNames[0]} is typing…` : `${typingNames.join(", ")} are typing…`}
                </p>
              )}
              <form className={`chat-composer${recordingVoice ? " chat-composer--recording" : ""}`} onSubmit={(event) => void sendMessage(event)}>
                {recordingVoice && (
                  <span className="chat-composer__recording" role="status" aria-label={`Recording voice message, ${formatRecordingTime(recordingSeconds)}`}>
                    <span className="chat-composer__recording-indicator" />
                    <span className="chat-composer__recording-time">{formatRecordingTime(recordingSeconds)}</span>
                    <span className="chat-composer__waveform" aria-hidden="true">
                      {Array.from({ length: 28 }, (_, index) => {
                        const baseHeight = 20 + ((index * 23 + 11) % 61);
                        const height = baseHeight * (0.55 + recordingAmplitude);
                        return <span key={index} style={{ height: `${Math.min(100, height)}%` }} />;
                      })}
                    </span>
                  </span>
                )}
                <input
                  aria-label="Write a message"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder={sendingVoice ? "Sending voice message…" : "Write a message…"}
                  maxLength={4000}
                  disabled={sending || recordingVoice || sendingVoice}
                />
                {recordingVoice ? (
                  <button
                    className="chat-composer__send-voice"
                    type="button"
                    aria-label="Send voice message"
                    title="Send voice message"
                    onClick={() => stopVoiceRecording(true)}
                  >
                    <Send size={16} />
                  </button>
                ) : (
                  <>
                    <button
                      className="chat-composer__voice"
                      type="button"
                      aria-label="Record voice message"
                      title="Record a voice message"
                      disabled={!conversationId || sending || sendingVoice}
                      onClick={() => void startVoiceRecording()}
                    >
                      <Mic size={16} />
                    </button>
                    <button type="submit" aria-label="Send message" disabled={!messageText.trim() || sending || sendingVoice}>
                      <Send size={16} />
                    </button>
                  </>
                )}
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
