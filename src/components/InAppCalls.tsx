import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, Maximize2, Mic, MicOff, Minimize2, Phone, PhoneOff, Search, UserPlus, Video, VideoOff, Volume2, VolumeX, X } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getProfilePhotoUrl, type AppRole, type CurrentUser } from "../lib/api";
import { apiRequest } from "../lib/api";
import { getNotificationSoundPreferences, playNotificationTone } from "../lib/notificationSounds";
import { supabase } from "../lib/supabase";
import "../css/InAppCalls.css";

type MediaMode = "audio" | "video";
const serviceWorkerControlledAtStartup = typeof navigator !== "undefined"
  && "serviceWorker" in navigator
  && Boolean(navigator.serviceWorker.controller);

interface CallInvitation {
  id: string;
  callerName: string;
  callerDepartment: string;
  callerAvatarPath: string | null;
  mediaMode: MediaMode;
  createdAt: string;
}

type IncomingCallNotificationAction = "open" | "answer" | "decline";

interface PendingIncomingCallAction {
  callId: string;
  action: IncomingCallNotificationAction;
}

interface CallUser {
  id: string;
  name: string;
  role: AppRole;
  avatarPath: string | null;
  status: "ringing" | "joined";
}

interface CallInvitePerson {
  id: string;
  name: string;
  role: AppRole;
  avatarPath: string | null;
  departmentName: string;
}

interface CallRoomDetails {
  call: { id: string; mediaMode: MediaMode; status: string; isCaller: boolean };
  user: { id: string; name: string; role: AppRole; avatarPath: string | null };
  participants: CallUser[];
  iceServers: RTCIceServer[];
  turnConfigured: boolean;
}

interface CallSignal {
  to: string;
  from: string;
  type: "offer" | "answer" | "candidate";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface CallPresence {
  userId: string;
  name: string;
  role: AppRole;
  avatarPath: string | null;
}

interface CallsContextValue {
  startCall: (participantIds: string[], mediaMode: MediaMode) => Promise<void>;
  endActiveCall: () => Promise<void>;
  callError: string;
}

const CallsContext = createContext<CallsContextValue | null>(null);

export function useInAppCalls() {
  const context = useContext(CallsContext);
  if (!context) throw new Error("useInAppCalls must be used within InAppCallsProvider.");
  return context;
}

function getVideoSender(connection: RTCPeerConnection) {
  return connection.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === "video")?.sender;
}

function shortName(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("") || "?";
}

function getRealtimeErrorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const details = ["message", "code", "reason", "status"]
      .flatMap((key) => {
        const value = Reflect.get(error, key);
        return typeof value === "string" ? [`${key}: ${value}`] : [];
      });
    if (details.length) return details.join(" · ");
  }
  return "Supabase Realtime returned no error details.";
}

function CallVideo({
  stream,
  muted = false,
  onDimensions,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  onDimensions?: (width: number, height: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      onLoadedMetadata={(event) => onDimensions?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
    />
  );
}

function CallAvatar({ name, avatarPath, large = false }: { name: string; avatarPath: string | null; large?: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = avatarPath ? getProfilePhotoUrl(avatarPath) : null;
  if (photoUrl && !photoFailed) {
    return (
      <img
        className={`call-tile__avatar-photo${large ? " call-tile__avatar-photo--large" : ""}`}
        src={photoUrl}
        alt={`${name}'s profile`}
        onError={() => setPhotoFailed(true)}
      />
    );
  }
  return <span className={`call-tile__avatar${large ? " call-tile__avatar--large" : ""}`}>{shortName(name)}</span>;
}

function CallRoom({
  callId,
  user,
  onClose,
  onFinishError,
  onRegisterFinish,
}: {
  callId: string;
  user: CurrentUser;
  onClose: () => void;
  onFinishError: (message: string) => void;
  onRegisterFinish: (finish: (() => Promise<void>) | null) => void;
}) {
  const [details, setDetails] = useState<CallRoomDetails | null>(null);
  const [participants, setParticipants] = useState<CallPresence[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [portraitVideos, setPortraitVideos] = useState<Record<string, boolean>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraOff, setCameraOff] = useState(true);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [invitePeople, setInvitePeople] = useState<CallInvitePerson[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const candidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const screenRef = useRef<MediaStream | null>(null);
  const cameraOffRef = useRef(true);
  const mutedRef = useRef(false);
  const mountedRef = useRef(true);
  const endedRef = useRef(false);

  const closeResources = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel && supabase) void supabase.removeChannel(channel);
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    candidatesRef.current.clear();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    screenRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    async function connect() {
      try {
        if (!supabase) throw new Error("Calls require the app's secure sign-in connection.");
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session || session.user.id !== user.id) {
          throw new Error("Your sign-in session changed. Reload the app and try the call again.");
        }
        await supabase.realtime.setAuth(session.access_token);
        const { data: canAccessRoom, error: authorizationError } = await supabase.rpc("can_access_call_topic", {
          p_topic: `call:${callId}`,
        });
        if (authorizationError) {
          throw new Error(`Could not verify call-room authorization: ${authorizationError.message}`);
        }
        if (canAccessRoom !== true) {
          throw new Error("The database call-room authorization check denied this signed-in account for this call.");
        }
        const room = await apiRequest<CallRoomDetails>(`/api/v1/calls/${callId}`);
        if (cancelled) return;
        setDetails(room);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setLocalStream(stream);
        const channel = supabase.channel(`call:${callId}`, {
          config: { private: true, presence: { key: user.id }, broadcast: { ack: true, self: false } },
        });
        channelRef.current = channel;

        const sendSignal = async (to: string, signal: Omit<CallSignal, "from" | "to">) => {
          const result = await channel.send({
            type: "broadcast",
            event: "rtc-signal",
            payload: { ...signal, from: user.id, to },
          });
          if (result !== "ok" && mountedRef.current) setError("Call signaling failed. Leave and reconnect.");
        };

        const createPeer = (peerId: string) => {
          const existing = peersRef.current.get(peerId);
          if (existing) return existing;
          const connection = new RTCPeerConnection({ iceServers: room.iceServers });
          stream.getAudioTracks().forEach((track) => connection.addTrack(track, stream));
          const videoTransceiver = connection.addTransceiver("video", { direction: "sendrecv" });
          const outgoingVideo = stream.getVideoTracks().find((track) => track.readyState === "live")
            ?? screenRef.current?.getVideoTracks()[0]
            ?? null;
          void videoTransceiver.sender.replaceTrack(outgoingVideo).catch((replaceError: unknown) => {
            console.error("Could not attach current video to a new call participant.", replaceError);
            if (mountedRef.current) setError("Your video could not be shared with a new participant. Turn your camera off and on to retry.");
          });
          connection.onicecandidate = (event) => {
            if (event.candidate) void sendSignal(peerId, { type: "candidate", candidate: event.candidate.toJSON() });
          };
          connection.ontrack = (event) => {
            let remote = remoteStreamsRef.current.get(peerId);
            if (!remote) {
              remote = new MediaStream();
              remoteStreamsRef.current.set(peerId, remote);
            }
            if (!remote.getTracks().some((track) => track.id === event.track.id)) remote.addTrack(event.track);
            setRemoteStreams((current) => ({ ...current, [peerId]: remote }));
            event.track.addEventListener("unmute", () => {
              if (mountedRef.current) setRemoteStreams((current) => ({ ...current, [peerId]: remote }));
            });
            event.track.addEventListener("mute", () => {
              if (mountedRef.current) setRemoteStreams((current) => ({ ...current, [peerId]: remote }));
            });
          };
          connection.onconnectionstatechange = () => {
            if (connection.connectionState === "failed" && mountedRef.current) {
              setError(room.turnConfigured
                ? "The call could not connect through the configured TURN relay. Check that the relay service and credentials are still active."
                : "This network requires a TURN relay, but one is not configured for calls yet. Contact your administrator to set one up.");
            }
          };
          peersRef.current.set(peerId, connection);
          return connection;
        };

        const flushCandidates = async (peerId: string, connection: RTCPeerConnection) => {
          const queued = candidatesRef.current.get(peerId) ?? [];
          candidatesRef.current.delete(peerId);
          for (const candidate of queued) await connection.addIceCandidate(new RTCIceCandidate(candidate));
        };

        channel
          .on("broadcast", { event: "rtc-signal" }, ({ payload }) => {
            const signal = payload as CallSignal;
            if (!signal || signal.to !== user.id || typeof signal.from !== "string") return;
            void (async () => {
              try {
                const connection = createPeer(signal.from);
                if (signal.type === "offer" && signal.description) {
                  await connection.setRemoteDescription(signal.description);
                  await flushCandidates(signal.from, connection);
                  await connection.setLocalDescription(await connection.createAnswer());
                  await sendSignal(signal.from, { type: "answer", description: connection.localDescription?.toJSON() });
                } else if (signal.type === "answer" && signal.description) {
                  await connection.setRemoteDescription(signal.description);
                  await flushCandidates(signal.from, connection);
                } else if (signal.type === "candidate" && signal.candidate) {
                  if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
                  else candidatesRef.current.set(signal.from, [...(candidatesRef.current.get(signal.from) ?? []), signal.candidate]);
                }
              } catch (signalError: unknown) {
                console.error("Could not connect an in-app call participant.", signalError);
                if (mountedRef.current) setError("A participant could not be connected. Leave and rejoin the call.");
              }
            })();
          })
          .on("presence", { event: "sync" }, () => {
            const members = Object.values(channel.presenceState<CallPresence>()).flat().filter((member) => member.userId !== user.id);
            const activeIds = new Set(members.map((member) => member.userId));
            for (const [peerId, peer] of peersRef.current) {
              if (!activeIds.has(peerId)) {
                peer.close();
                peersRef.current.delete(peerId);
                remoteStreamsRef.current.delete(peerId);
                candidatesRef.current.delete(peerId);
              }
            }
            setRemoteStreams((current) => Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(id))));
            setParticipants(members);
            for (const member of members) {
              if (user.id.localeCompare(member.userId) >= 0 || peersRef.current.has(member.userId)) continue;
              void (async () => {
                try {
                  const peer = createPeer(member.userId);
                  await peer.setLocalDescription(await peer.createOffer());
                  await sendSignal(member.userId, { type: "offer", description: peer.localDescription?.toJSON() });
                } catch (signalError: unknown) {
                  console.error("Could not start an in-app call connection.", signalError);
                  if (mountedRef.current) setError("The call could not connect to a colleague. Please rejoin.");
                }
              })();
            }
          })
          .on("broadcast", { event: "call-ended" }, () => {
            closeResources();
            onClose();
          })
          .subscribe(async (status, subscriptionError) => {
            if (status === "SUBSCRIBED") {
              try {
                const presenceStatus = await channel.track({
                  userId: user.id,
                  name: room.user.name,
                  role: room.user.role,
                  avatarPath: room.user.avatarPath,
                });
                if (presenceStatus !== "ok") throw new Error("Call presence could not be announced.");
                if (mountedRef.current) {
                  setJoining(false);
                  if (room.call.mediaMode === "video") void startCamera();
                }
              } catch (presenceError: unknown) {
                console.error("Could not join the secure in-app call room.", presenceError);
                if (mountedRef.current) {
                  setJoining(false);
                  setError("The secure call room rejected your connection. Check the network and call-room authorization policies, then retry.");
                }
              }
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              console.error("In-app call Realtime channel failed to connect.", { status, error: subscriptionError });
              if (mountedRef.current) {
                setJoining(false);
                setError(`Call room connection failed (${status}): ${getRealtimeErrorDetail(subscriptionError)}. Check the Supabase Realtime connection and participant policies.`);
              }
            }
          });
      } catch (connectError: unknown) {
        if (cancelled) return;
        console.error("Could not start the in-app call.", connectError);
        setError(connectError instanceof Error ? connectError.message : "We couldn't join this call.");
        setJoining(false);
      }
    }
    void connect();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      closeResources();
    };
  }, [callId, closeResources, user.id]);

  useEffect(() => {
    let stopped = false;
    let checking = false;
    let reportedStatusError = false;
    const checkCallStatus = async () => {
      if (stopped || checking) return;
      checking = true;
      try {
        await apiRequest<CallRoomDetails>(`/api/v1/calls/${callId}`);
        reportedStatusError = false;
      } catch (statusError: unknown) {
        if (stopped) return;
        if (statusError instanceof Error && statusError.message === "This call has ended or its invitation expired.") {
          closeResources();
          onClose();
        } else if (!reportedStatusError) {
          console.error("Could not check the outgoing call status.", statusError);
          reportedStatusError = true;
        }
      } finally {
        checking = false;
      }
    };
    const interval = window.setInterval(() => void checkCallStatus(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [callId, closeResources, onClose]);

  useEffect(() => {
    if (!showInvitePicker) return;
    let active = true;
    setInviteLoading(true);
    setInviteError("");
    setInviteSuccess("");
    void apiRequest<{ people: CallInvitePerson[] }>("/api/v1/chat/people")
      .then(({ people }) => {
        if (active) setInvitePeople(people);
      })
      .catch((loadError: unknown) => {
        console.error("Could not load colleagues to invite to the call.", loadError);
        if (active) setInviteError(loadError instanceof Error ? loadError.message : "We couldn't load colleagues.");
      })
      .finally(() => {
        if (active) setInviteLoading(false);
      });
    return () => { active = false; };
  }, [showInvitePicker]);

  const currentParticipantIds = new Set([
    user.id,
    ...(details?.participants.map((participant) => participant.id) ?? []),
    ...participants.map((participant) => participant.userId),
  ]);
  const availableInviteSlots = Math.max(0, 8 - currentParticipantIds.size);
  const isGroupCall = currentParticipantIds.size > 2;
  const filteredInvitePeople = invitePeople.filter((person) =>
    !currentParticipantIds.has(person.id)
    && `${person.name} ${person.departmentName} ${person.role}`.toLocaleLowerCase().includes(inviteSearch.trim().toLocaleLowerCase()));

  async function inviteSelectedPeople() {
    if (inviting || selectedInviteIds.length === 0) return;
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      const result = await apiRequest<{ invited: CallUser[] }>(`/api/v1/calls/${callId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ participantIds: selectedInviteIds }),
      });
      setDetails((current) => current
        ? { ...current, participants: [...current.participants, ...result.invited] }
        : current);
      setSelectedInviteIds([]);
      setInviteSuccess(`${result.invited.length} ${result.invited.length === 1 ? "person" : "people"} invited to the call.`);
    } catch (inviteRequestError: unknown) {
      console.error("Could not invite colleagues to the call.", inviteRequestError);
      setInviteError(inviteRequestError instanceof Error ? inviteRequestError.message : "We couldn't invite those colleagues.");
    } finally {
      setInviting(false);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access requires a supported browser over HTTPS.");
      return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const track = camera.getVideoTracks()[0];
      const local = streamRef.current;
      if (!track || !local) throw new Error("The browser did not provide a camera video track.");
      const oldTrack = local.getVideoTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        local.removeTrack(oldTrack);
      }
      local.addTrack(track);
      await Promise.all([...peersRef.current.values()].map(async (peer) => {
        const sender = getVideoSender(peer);
        if (sender) await sender.replaceTrack(track);
      }));
      cameraOffRef.current = false;
      setCameraOff(false);
      setLocalStream(new MediaStream(local.getTracks()));
    } catch (cameraError: unknown) {
      console.error("Could not enable in-app call video.", cameraError);
      setError(cameraError instanceof DOMException && cameraError.name === "NotAllowedError"
        ? "Camera permission was blocked. Allow camera access in the browser, then try again."
        : cameraError instanceof DOMException && cameraError.name === "NotReadableError"
          ? "The camera is busy in another app or tab. Close it there, then try again."
          : cameraError instanceof DOMException && (cameraError.name === "AbortError" || cameraError.name === "TimeoutError")
            ? "The camera timed out while starting. You can retry or end the call."
          : cameraError instanceof Error ? cameraError.message : "The camera could not start.");
    }
  }

  async function toggleCamera() {
    if (cameraBusy) return;
    setCameraBusy(true);
    try {
      await updateCamera();
    } finally {
      if (mountedRef.current) setCameraBusy(false);
    }
  }

  async function updateCamera() {
    const local = streamRef.current;
    if (!cameraOffRef.current) {
      const track = local?.getVideoTracks()[0];
      if (!track || !local) return;
      track.stop();
      local.removeTrack(track);
      try {
        await Promise.all([...peersRef.current.values()].map(async (peer) => {
          const sender = getVideoSender(peer);
          if (sender) await sender.replaceTrack(null);
        }));
      } catch (toggleError: unknown) {
        console.error("Could not stop sending in-app call video.", toggleError);
        setError("Your camera stopped, but a participant may need to reconnect to refresh video.");
      }
      cameraOffRef.current = true;
      setCameraOff(true);
      setLocalStream(new MediaStream(local.getTracks()));
      return;
    }
    setError("");
    await startCamera();
  }

  async function toggleMute() {
    const nextMuted = !mutedRef.current;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
  }

  const finishingRef = useRef(false);
  const finishCall = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      try {
        await apiRequest(`/api/v1/calls/${callId}/${isGroupCall ? "leave" : "end"}`, { method: "PATCH" });
      } catch (finishError: unknown) {
        console.error("Could not close the active call cleanly.", finishError);
        onFinishError(finishError instanceof Error ? finishError.message : "The call could not be ended on the server.");
        try {
          await apiRequest("/api/v1/calls/signout", { method: "POST" });
        } catch (fallbackError: unknown) {
          console.error("Could not clean up call sessions after the end-call request failed.", fallbackError);
          onFinishError(fallbackError instanceof Error ? fallbackError.message : "Call cleanup also failed.");
        }
      }
    } finally {
      closeResources();
      onClose();
      finishingRef.current = false;
    }
  }, [callId, closeResources, isGroupCall, onClose, onFinishError]);

  useEffect(() => {
    onRegisterFinish(finishCall);
    return () => onRegisterFinish(null);
  }, [finishCall, onRegisterFinish]);

  useEffect(() => {
    if (joining || !participants.length) return;
    const timer = window.setInterval(() => setCallSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [joining, participants.length]);

  const remoteName = participants[0]?.name
    ?? details?.participants.find((participant) => participant.id !== user.id)?.name
    ?? "Calling";
  const callDuration = `${Math.floor(callSeconds / 60).toString().padStart(2, "0")}:${(callSeconds % 60).toString().padStart(2, "0")}`;
  const soloCall = participants.length <= 1;
  const localVideoTrack = localStream?.getVideoTracks().find((track) => track.readyState === "live" && track.enabled);

  return (
    <div className={`call-overlay${minimized ? " call-overlay--minimized" : ""}`} role="dialog" aria-modal={!minimized} aria-label="In-app call">
      <section className={`call-window${soloCall ? " call-window--solo" : ""}${minimized ? " call-window--minimized" : ""}`}>
        <header className="call-window__header">
          <div className="call-window__identity">
            <strong>{remoteName}</strong>
            <small>{joining ? "Connecting…" : participants.length ? callDuration : details?.call.isCaller ? "Ringing…" : "Waiting for answer…"}</small>
            <span className="call-window__secure">🔒 End-to-end private</span>
          </div>
          <div className="call-window__header-actions">
            <button
              className="call-window__invite"
              type="button"
              onClick={() => {
                setInviteSearch("");
                setSelectedInviteIds([]);
                setShowInvitePicker(true);
              }}
              disabled={!details}
              aria-label="Add people to call"
              title="Add people to call"
            >
              <UserPlus size={17} />
              <span>Add people</span>
            </button>
          </div>
          <button
            className="call-window__minimize"
            type="button"
            onClick={() => setMinimized((current) => !current)}
            aria-label={minimized ? "Restore call" : "Minimize call"}
            title={minimized ? "Restore call" : "Minimize call"}
          >
            {minimized ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
          </button>
        </header>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <div className={`call-window__tiles${soloCall ? " call-window__tiles--solo" : ""}`}>
          {participants.map((participant) => {
            const remote = remoteStreams[participant.userId];
            const hasVideo = remote?.getVideoTracks().some((track) => track.readyState === "live" && !track.muted);
            return (
              <article className={`call-tile call-tile--remote${soloCall ? " call-tile--hero" : ""}${portraitVideos[participant.userId] ? " call-tile--portrait" : ""}`} key={participant.userId}>
                {hasVideo
                  ? <CallVideo
                    stream={remote ?? null}
                    muted
                    onDimensions={(width, height) => setPortraitVideos((current) => ({
                      ...current,
                      [participant.userId]: height > width,
                    }))}
                  />
                  : <CallAvatar
                    name={participant.name}
                    avatarPath={participant.avatarPath ?? details?.participants.find((person) => person.id === participant.userId)?.avatarPath ?? null}
                    large
                  />}
                <audio autoPlay muted={speakerMuted} ref={(node) => { if (node) node.srcObject = remote ?? null; }} />
                <strong><span className="call-tile__audio-indicator" />{participant.name}</strong>
              </article>
            );
          })}
          {!participants.length && (
            <div className="call-window__waiting">
              <CallAvatar
                name={remoteName}
                avatarPath={details?.participants.find((participant) => participant.id !== user.id)?.avatarPath ?? null}
                large
              />
              <strong>{details?.call.isCaller ? `Calling ${remoteName}` : "Connecting your call"}</strong>
              <small>{joining ? "Securing connection…" : "Ringing…"}</small>
            </div>
          )}
          {((localVideoTrack && !cameraOff) || minimized) && (
            <article className={`call-tile call-tile--local${soloCall ? " call-tile--selfie" : ""}${portraitVideos[user.id] ? " call-tile--portrait" : ""}`}>
              {localVideoTrack && !cameraOff
                ? <CallVideo
                  stream={localStream}
                  muted
                  onDimensions={(width, height) => setPortraitVideos((current) => ({
                    ...current,
                    [user.id]: height > width,
                  }))}
                />
                : <CallAvatar name={user.displayName?.trim() || "You"} avatarPath={user.avatarPath} large />}
              <strong>You</strong>
            </article>
          )}
        </div>
        <footer className="call-window__controls">
          <button className={`call-control${muted ? " call-control--active" : ""}`} type="button" onClick={() => void toggleMute()} aria-label={muted ? "Unmute microphone" : "Mute microphone"}><span>{muted ? <MicOff size={21} /> : <Mic size={21} />}</span><small>{muted ? "Unmute" : "Mute"}</small></button>
          <button className={`call-control${speakerMuted ? " call-control--active" : ""}`} type="button" onClick={() => setSpeakerMuted((value) => !value)} aria-label={speakerMuted ? "Turn speaker on" : "Mute call audio"}><span>{speakerMuted ? <VolumeX size={21} /> : <Volume2 size={21} />}</span><small>{speakerMuted ? "Speaker off" : "Speaker"}</small></button>
          <button className={`call-control${cameraOff ? " call-control--active" : ""}`} type="button" onClick={() => void toggleCamera()} disabled={cameraBusy} aria-label={cameraOff ? "Start video" : "Stop video"}><span>{cameraOff ? <Video size={21} /> : <VideoOff size={21} />}</span><small>{cameraBusy ? "Updating…" : cameraOff ? "Start video" : "Stop video"}</small></button>
          <button className="call-control call-control--end" type="button" onClick={() => void finishCall()} aria-label={isGroupCall ? "Leave group call" : "End call for everyone"}><span><PhoneOff size={21} /></span><small>{isGroupCall ? "Leave call" : "End call"}</small></button>
        </footer>
      </section>
      {showInvitePicker && (
        <div className="call-invite-backdrop" role="dialog" aria-modal="true" aria-labelledby="call-invite-title">
          <section className="call-invite-dialog">
            <header className="call-invite-dialog__header">
              <div>
                <h2 id="call-invite-title">Add people to call</h2>
                <p>{availableInviteSlots} of 8 participant spots available</p>
              </div>
              <button type="button" onClick={() => setShowInvitePicker(false)} aria-label="Close invite list">
                <X size={19} />
              </button>
            </header>
            <label className="call-invite-search">
              <Search size={17} />
              <input
                type="search"
                value={inviteSearch}
                onChange={(event) => setInviteSearch(event.target.value)}
                placeholder="Search colleagues"
                aria-label="Search colleagues to invite"
                autoFocus
              />
            </label>
            {inviteError && <p className="call-invite-message call-invite-message--error" role="alert">{inviteError}</p>}
            {inviteSuccess && <p className="call-invite-message call-invite-message--success" role="status">{inviteSuccess}</p>}
            <div className="call-invite-list">
              {inviteLoading && <p className="call-invite-empty">Loading colleagues…</p>}
              {!inviteLoading && filteredInvitePeople.map((person) => {
                const selected = selectedInviteIds.includes(person.id);
                const selectionFull = selectedInviteIds.length >= availableInviteSlots;
                return (
                  <button
                    className={`call-invite-person${selected ? " call-invite-person--selected" : ""}`}
                    type="button"
                    key={person.id}
                    disabled={!selected && selectionFull}
                    onClick={() => setSelectedInviteIds((current) => selected
                      ? current.filter((id) => id !== person.id)
                      : [...current, person.id])}
                  >
                    <CallAvatar name={person.name} avatarPath={person.avatarPath} />
                    <span className="call-invite-person__identity">
                      <strong>{person.name}</strong>
                      <small>{person.departmentName}</small>
                    </span>
                    <span className="call-invite-person__check">{selected && <Check size={16} />}</span>
                  </button>
                );
              })}
              {!inviteLoading && filteredInvitePeople.length === 0 && (
                <p className="call-invite-empty">
                  {availableInviteSlots === 0
                    ? "This call is full."
                    : inviteSearch.trim() ? "No colleagues match that search." : "There are no more colleagues to add."}
                </p>
              )}
            </div>
            <footer className="call-invite-dialog__actions">
              <button type="button" className="call-invite-cancel" onClick={() => setShowInvitePicker(false)}>Cancel</button>
              <button
                type="button"
                className="call-invite-submit"
                onClick={() => void inviteSelectedPeople()}
                disabled={inviting || selectedInviteIds.length === 0}
              >
                {inviting ? "Adding…" : `Add selected${selectedInviteIds.length ? ` (${selectedInviteIds.length})` : ""}`}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

export function InAppCallsProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<CallInvitation[]>([]);
  const [pendingNotificationAction, setPendingNotificationAction] = useState<PendingIncomingCallAction | null>(null);
  const [callError, setCallError] = useState("");
  const startingRef = useRef(false);
  const finishCallRef = useRef<(() => Promise<void>) | null>(null);
  const seenInvitationIdsRef = useRef(new Set<string>());
  const seenMessageNotificationIdsRef = useRef(new Set<string>());
  const handledNotificationActionsRef = useRef(new Set<string>());
  const reloadAfterCallForUpdateRef = useRef(false);

  useEffect(() => {
    if (!serviceWorkerControlledAtStartup || !("serviceWorker" in navigator)) return;
    const handleControllerChange = () => {
      if (activeCallId) {
        reloadAfterCallForUpdateRef.current = true;
      } else {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  }, [activeCallId]);

  useEffect(() => {
    if (!activeCallId && reloadAfterCallForUpdateRef.current) window.location.reload();
  }, [activeCallId]);

  const registerFinishCall = useCallback((finish: (() => Promise<void>) | null) => {
    finishCallRef.current = finish;
  }, []);

  const endActiveCall = useCallback(async () => {
    if (activeCallId && finishCallRef.current) {
      await finishCallRef.current();
      return;
    }
    if (activeCallId) setActiveCallId(null);
    void apiRequest("/api/v1/calls/signout", { method: "POST" }).catch((callError: unknown) => {
      console.error("Could not end in-app call sessions while signing out.", callError);
    });
  }, [activeCallId]);

  const startCall = useCallback(async (participantIds: string[], mediaMode: MediaMode) => {
    if (startingRef.current || activeCallId) throw new Error("Finish the current call before starting another.");
    startingRef.current = true;
    setCallError("");
    try {
      const result = await apiRequest<{ callId: string }>("/api/v1/calls", {
        method: "POST",
        body: JSON.stringify({ participantIds, mediaMode }),
      });
      setActiveCallId(result.callId);
    } catch (error: unknown) {
      console.error("Could not start an in-app call.", error);
      const message = error instanceof Error ? error.message : "We couldn't start this call.";
      setCallError(message);
      throw new Error(message);
    } finally {
      startingRef.current = false;
    }
  }, [activeCallId]);

  useEffect(() => {
    const launchUrl = new URL(window.location.href);
    const callId = launchUrl.searchParams.get("incomingCallId");
    const action = launchUrl.searchParams.get("incomingCallAction");
    if (
      callId &&
      (action === "open" || action === "answer" || action === "decline")
    ) {
      setPendingNotificationAction({ callId, action });
      launchUrl.searchParams.delete("incomingCallId");
      launchUrl.searchParams.delete("incomingCallAction");
      window.history.replaceState(null, "", `${launchUrl.pathname}${launchUrl.search}${launchUrl.hash}`);
    }
  }, []);

  useEffect(() => {
    if (activeCallId) return;
    let stopped = false;
    let requestRunning = false;
    const checkCalls = async () => {
      if (requestRunning || stopped || document.visibilityState !== "visible") return;
      requestRunning = true;
      try {
        const result = await apiRequest<{ invitations: CallInvitation[] }>("/api/v1/calls/invitations");
        if (stopped) return;
        const newInvitations = result.invitations.filter((invitation) => !seenInvitationIdsRef.current.has(invitation.id));
        for (const invitation of result.invitations) {
          seenInvitationIdsRef.current.add(invitation.id);
        }
        if (seenInvitationIdsRef.current.size > 100) {
          const oldestId = seenInvitationIdsRef.current.values().next().value;
          if (oldestId) seenInvitationIdsRef.current.delete(oldestId);
        }
        setInvitations(result.invitations);
        if (newInvitations.length > 0 && getNotificationSoundPreferences(user.id).calls) {
          void playNotificationTone("call").catch((error: unknown) => {
            console.error("Could not play the incoming call tone.", error);
          });
        }
      } catch (error: unknown) {
        console.error("Could not check for incoming calls.", error);
      } finally {
        requestRunning = false;
      }
    };
    const handleWorkerMessage = (event: MessageEvent<{
      type?: string;
      callId?: unknown;
      action?: unknown;
    }>) => {
      if (event.data?.type !== "flexbar:incoming-call") return;
      if (
        typeof event.data.callId === "string" &&
        (event.data.action === "open" || event.data.action === "answer" || event.data.action === "decline")
      ) {
        setPendingNotificationAction({ callId: event.data.callId, action: event.data.action });
      }
      void checkCalls();
    };
    navigator.serviceWorker?.addEventListener("message", handleWorkerMessage);
    void checkCalls();
    const interval = window.setInterval(() => void checkCalls(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      navigator.serviceWorker?.removeEventListener("message", handleWorkerMessage);
    };
  }, [activeCallId, user.id]);

  useEffect(() => {
    if (!pendingNotificationAction) return;
    const invitation = invitations.find(({ id }) => id === pendingNotificationAction.callId);
    if (!invitation) return;

    const actionKey = `${pendingNotificationAction.callId}:${pendingNotificationAction.action}`;
    if (handledNotificationActionsRef.current.has(actionKey)) {
      setPendingNotificationAction(null);
      return;
    }
    handledNotificationActionsRef.current.add(actionKey);
    setPendingNotificationAction(null);
    if (pendingNotificationAction.action === "answer") {
      void answer(invitation);
    } else if (pendingNotificationAction.action === "decline") {
      void decline(invitation);
    }
  }, [invitations, pendingNotificationAction]);

  useEffect(() => {
    const playForMessage = (notificationId: unknown, notificationType: unknown) => {
      if (
        typeof notificationType !== "string" ||
        !["chat_message", "message"].includes(notificationType.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_")) ||
        document.visibilityState !== "visible" ||
        !getNotificationSoundPreferences(user.id).messages
      ) return;
      if (typeof notificationId === "string") {
        if (seenMessageNotificationIdsRef.current.has(notificationId)) return;
        seenMessageNotificationIdsRef.current.add(notificationId);
        if (seenMessageNotificationIdsRef.current.size > 100) {
          const oldestId = seenMessageNotificationIdsRef.current.values().next().value;
          if (oldestId) seenMessageNotificationIdsRef.current.delete(oldestId);
        }
      }
      void playNotificationTone("message").catch((error: unknown) => {
        console.error("Could not play the incoming message tone.", error);
      });
    };
    const handleRealtimeNotification = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (typeof detail !== "object" || detail === null) return;
      playForMessage(Reflect.get(detail, "notificationId"), Reflect.get(detail, "notificationType"));
    };
    const handleWorkerNotification = (event: MessageEvent<{ type?: string; notificationId?: unknown; notificationType?: unknown }>) => {
      if (event.data?.type === "flexbar:notification") {
        playForMessage(event.data.notificationId, event.data.notificationType);
      }
    };
    window.addEventListener("flexbar:notification-sound", handleRealtimeNotification);
    navigator.serviceWorker?.addEventListener("message", handleWorkerNotification);
    return () => {
      window.removeEventListener("flexbar:notification-sound", handleRealtimeNotification);
      navigator.serviceWorker?.removeEventListener("message", handleWorkerNotification);
    };
  }, [user.id]);

  async function answer(invitation: CallInvitation) {
    setCallError("");
    try {
      await apiRequest(`/api/v1/calls/${invitation.id}/join`, { method: "PATCH" });
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setActiveCallId(invitation.id);
    } catch (error: unknown) {
      console.error("Could not answer in-app call.", error);
      setCallError(error instanceof Error ? error.message : "We couldn't answer this call.");
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
    }
  }

  async function decline(invitation: CallInvitation) {
    setInvitations((current) => current.filter((item) => item.id !== invitation.id));
    try {
      await apiRequest(`/api/v1/calls/${invitation.id}/decline`, { method: "PATCH" });
    } catch (error: unknown) {
      console.error("Could not decline in-app call.", error);
      setCallError(error instanceof Error ? error.message : "We couldn't decline this call.");
    }
  }

  const incoming = invitations[0];
  return (
    <CallsContext.Provider value={{ startCall, endActiveCall, callError }}>
      {children}
      {incoming && !activeCallId && (
        <div className="call-incoming" role="dialog" aria-modal="true" aria-label="Incoming call">
          <IncomingCallerAvatar name={incoming.callerName} avatarPath={incoming.callerAvatarPath} />
          <strong>{incoming.callerName} is calling</strong>
          <span>{incoming.callerDepartment} · {incoming.mediaMode === "video" ? "Video call" : "Voice call"}</span>
          <div className="call-incoming__actions">
            <button className="button button--danger" type="button" onClick={() => void decline(incoming)}><PhoneOff size={17} />Decline</button>
            <button className="button button--primary" type="button" onClick={() => void answer(incoming)}><Phone size={17} />Answer</button>
          </div>
        </div>
      )}
      {activeCallId && <CallRoom callId={activeCallId} user={user} onClose={() => setActiveCallId(null)} onFinishError={setCallError} onRegisterFinish={registerFinishCall} />}
      {callError && <div className="call-toast" role="alert">{callError}<button type="button" onClick={() => setCallError("")} aria-label="Dismiss call error">×</button></div>}
    </CallsContext.Provider>
  );
}

function IncomingCallerAvatar({ name, avatarPath }: { name: string; avatarPath: string | null }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = avatarPath ? getProfilePhotoUrl(avatarPath) : null;
  return (
    <div className="call-incoming__avatar">
      {photoUrl && !photoFailed
        ? <img src={photoUrl} alt="" onError={() => setPhotoFailed(true)} />
        : shortName(name)}
    </div>
  );
}
