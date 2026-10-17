import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, ScreenShare, ScreenShareOff, Video, VideoOff } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AppRole, CurrentUser } from "../lib/api";
import { apiRequest, getProfilePhotoUrl } from "../lib/api";
import { supabase } from "../lib/supabase";
import { roleLabel } from "../lib/roles";

interface Meeting {
  id: string;
  title: string;
  departmentName: string;
  startsAt: string;
}

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface RoomDetails {
  meeting: Meeting;
  user: { id: string; name: string; role: AppRole; avatarPath: string | null };
  iceServers: IceServer[];
  turnConfigured: boolean;
}

interface PresenceMember {
  userId: string;
  name: string;
  role: AppRole;
  avatarPath?: string | null;
  screenSharing?: boolean;
}

interface SignalMessage {
  to: string;
  from: string;
  type: "offer" | "answer" | "candidate";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface RemoteParticipant {
  userId: string;
  name: string;
  role: AppRole;
  avatarPath: string | null;
  screenSharing?: boolean;
}

function ParticipantAvatar({ name, avatarPath }: { name: string; avatarPath: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);
  const photoUrl = getProfilePhotoUrl(avatarPath);
  if (photoUrl && !imageFailed) {
    return <img className="meeting-participant-avatar" src={photoUrl} alt={`${name}'s profile`} onError={() => setImageFailed(true)} />;
  }
  return <span className="initial-avatar">{name.trim().slice(0, 1).toLocaleUpperCase() || "?"}</span>;
}

function useSpeaking(stream: MediaStream | null | undefined) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream?.getAudioTracks().some((track) => track.enabled && track.readyState === "live")) {
      setSpeaking(false);
      return;
    }
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.55;
    const source = audioContext.createMediaStreamSource(stream);
    const silentOutput = audioContext.createGain();
    silentOutput.gain.value = 0;
    source.connect(analyser);
    analyser.connect(silentOutput);
    silentOutput.connect(audioContext.destination);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let lastSample = 0;
    let isActive = true;
    let detected = false;
    const detect = (time: number) => {
      if (!isActive) return;
      frame = window.requestAnimationFrame(detect);
      if (time - lastSample < 100) return;
      lastSample = time;
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        energy += normalized * normalized;
      }
      const nextDetected = Math.sqrt(energy / samples.length) > 0.035;
      if (detected !== nextDetected) {
        detected = nextDetected;
        setSpeaking(nextDetected);
      }
    };
    frame = window.requestAnimationFrame(detect);
    void audioContext.resume().catch((error: unknown) => {
      console.error("Could not start participant audio activity detection.", error);
    });
    return () => {
      isActive = false;
      window.cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      silentOutput.disconnect();
      void audioContext.close();
    };
  }, [stream]);
  return speaking;
}

function SoundWave({ stream }: { stream: MediaStream | null | undefined }) {
  const speaking = useSpeaking(stream);
  return (
    <span className={`meeting-sound-wave${speaking ? " meeting-sound-wave--active" : ""}`} aria-label={speaking ? "Speaking" : "Not speaking"} title={speaking ? "Speaking" : "Not speaking"}>
      <i /><i /><i /><i />
    </span>
  );
}

function AudioParticipantTile({ name, role, avatarPath, stream }: { name: string; role?: AppRole; avatarPath: string | null; stream: MediaStream | undefined }) {
  return (
    <div className="meeting-audio-participant">
      <RemoteAudio stream={stream} />
      <div className="meeting-audio-participant__avatar"><ParticipantAvatar name={name} avatarPath={avatarPath} /><SoundWave stream={stream} /></div>
      <strong>{name}{role === "super_admin" || role === "management_admin" ? " · Administrator" : ""}</strong>
      {role && <small>{roleLabel(role)}</small>}
    </div>
  );
}

function LocalVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="meeting-video meeting-video--local" />;
}

function RemoteVideo({ stream, audioStream, name, muted, screenSharing }: { stream: MediaStream | undefined; audioStream?: MediaStream; name: string; muted: boolean; screenSharing?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return (
    <div className={`meeting-video-tile${screenSharing ? " meeting-video-tile--screen" : ""}`}>
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span className="meeting-video-tile__label">{name}<SoundWave stream={audioStream ?? stream} /></span>
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream | undefined }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function getVideoSender(connection: RTCPeerConnection) {
  return connection.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === "video")?.sender;
}

export default function MeetingCallRoom({ meeting, user }: { meeting: Meeting; user: CurrentUser }) {
  const [inCall, setInCall] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(user.role === "super_admin" || user.role === "management_admin");
  const [cameraOff, setCameraOff] = useState(true);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [callError, setCallError] = useState("");
  const [turnConfigured, setTurnConfigured] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const candidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const mountedRef = useRef(true);
  const mutedRef = useRef(muted);
  const cameraOffRef = useRef(cameraOff);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const presenceDetailsRef = useRef<{ userId: string; name: string; role: AppRole; avatarPath: string | null } | null>(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { cameraOffRef.current = cameraOff; }, [cameraOff]);

  function closeCall() {
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel && supabase) void supabase.removeChannel(channel);
    for (const connection of peersRef.current.values()) connection.close();
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    candidatesRef.current.clear();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setScreenSharing(false);
    cameraOffRef.current = true;
    setCameraOff(true);
    presenceDetailsRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setParticipants([]);
    setInCall(false);
    setConnecting(false);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel && supabase) void supabase.removeChannel(channel);
      for (const connection of peersRef.current.values()) connection.close();
      peersRef.current.clear();
      remoteStreamsRef.current.clear();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      screenStreamRef.current?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenStreamRef.current = null;
    };
  }, []);

  function mediaErrorMessage(error: unknown) {
    if (!(error instanceof DOMException)) {
      return error instanceof Error ? error.message : "We couldn't join the live meeting.";
    }
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Camera or microphone access was blocked. Allow access for this site in your browser's address-bar permissions, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No requested camera or microphone was found. Connect the device and try again.";
    }
    if (error.name === "NotReadableError" || error.name === "AbortError" || /timeout|video source/i.test(error.message)) {
      return "The camera could not start. Close other apps or tabs using it, check that it is connected, then retry. Your audio call can continue while the camera is off.";
    }
    if (error.name === "OverconstrainedError") {
      return "The selected camera could not meet the browser's requirements. Check your camera settings and retry.";
    }
    return error.message || "We couldn't access the camera or microphone.";
  }

  async function joinCall() {
    setConnecting(true);
    setCallError("");
    try {
      if (!supabase) throw new Error("Live meeting calls need the configured Supabase sign-in connection.");
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser cannot access the microphone or camera. Open Flex Bar in a modern browser over HTTPS.");
      }
      const room = await apiRequest<RoomDetails>(`/api/v1/department/meetings/${meeting.id}/room`);
      const topic = `department-meeting:${meeting.id}`;
      const existingChannel = supabase.getChannels().find((existing) => existing.topic === `realtime:${topic}`);
      if (existingChannel) {
        if (channelRef.current === existingChannel) channelRef.current = null;
        const removeStatus = await supabase.removeChannel(existingChannel);
        if (removeStatus !== "ok") throw new Error("The previous meeting connection could not be closed. Please try joining again.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (user.role === "super_admin" || user.role === "management_admin") {
        for (const track of stream.getAudioTracks()) track.enabled = false;
      }
      streamRef.current = stream;
      setLocalStream(stream);
      cameraOffRef.current = true;
      setMuted(user.role === "super_admin" || user.role === "management_admin");
      setCameraOff(true);
      setTurnConfigured(room.turnConfigured);

      const channel = supabase.channel(topic, {
        config: {
          private: true,
          presence: { key: user.id },
          broadcast: { ack: true, self: false },
        },
      });
      channelRef.current = channel;
      presenceDetailsRef.current = { userId: user.id, name: room.user.name, role: room.user.role, avatarPath: room.user.avatarPath };

      const sendSignal = async (to: string, signal: Omit<SignalMessage, "from" | "to">) => {
        const activeChannel = channelRef.current;
        if (!activeChannel) return;
        const result = await activeChannel.send({
          type: "broadcast",
          event: "rtc-signal",
          payload: { ...signal, from: user.id, to },
        });
        if (result !== "ok") {
          console.error("Could not send real-time meeting call signal.", result);
          if (mountedRef.current) setCallError("The live call connection could not send its signal. Please leave and rejoin.");
        }
      };

      const createPeer = (peerId: string) => {
        const existing = peersRef.current.get(peerId);
        if (existing) return existing;
        const connection = new RTCPeerConnection({ iceServers: room.iceServers });
        const local = streamRef.current;
        local?.getAudioTracks().forEach((track) => connection.addTrack(track, local));
        const videoSender = local?.getVideoTracks()[0]
          ? connection.addTrack(local.getVideoTracks()[0], local)
          : connection.addTransceiver("video", { direction: "sendrecv" }).sender;
        const currentScreenTrack = screenStreamRef.current?.getVideoTracks()[0];
        if (currentScreenTrack) void videoSender.replaceTrack(currentScreenTrack);
        connection.onicecandidate = (event) => {
          if (event.candidate) void sendSignal(peerId, { type: "candidate", candidate: event.candidate.toJSON() });
        };
        connection.ontrack = (event) => {
          let remote = remoteStreamsRef.current.get(peerId);
          if (!remote) {
            remote = new MediaStream();
            remoteStreamsRef.current.set(peerId, remote);
          }
          for (const sourceStream of event.streams) {
            for (const track of sourceStream.getTracks()) {
              if (!remote.getTracks().some((existing) => existing.id === track.id)) remote.addTrack(track);
            }
          }
          if (!remote.getTracks().some((track) => track.id === event.track.id)) remote.addTrack(event.track);
          if (mountedRef.current) setRemoteStreams((current) => ({ ...current, [peerId]: remote }));
          event.track.addEventListener("unmute", () => {
            if (mountedRef.current) setRemoteStreams((current) => ({ ...current, [peerId]: remote }));
          });
          event.track.addEventListener("mute", () => {
            if (mountedRef.current) setRemoteStreams((current) => ({ ...current, [peerId]: remote }));
          });
        };
        connection.onconnectionstatechange = () => {
          if (connection.connectionState === "failed" && mountedRef.current) {
            setCallError("A direct connection could not be made. Ask your administrator to configure TURN relay service for restricted networks.");
          }
        };
        peersRef.current.set(peerId, connection);
        return connection;
      };

      const addPendingCandidates = async (peerId: string, connection: RTCPeerConnection) => {
        const pending = candidatesRef.current.get(peerId) ?? [];
        candidatesRef.current.delete(peerId);
        for (const candidate of pending) await connection.addIceCandidate(new RTCIceCandidate(candidate));
      };

      channel
        .on("broadcast", { event: "rtc-signal" }, ({ payload }) => {
          const signal = payload as SignalMessage;
          if (!signal || signal.to !== user.id || typeof signal.from !== "string") return;
          void (async () => {
            try {
              const connection = createPeer(signal.from);
              if (signal.type === "offer" && signal.description) {
                await connection.setRemoteDescription(new RTCSessionDescription(signal.description));
                await addPendingCandidates(signal.from, connection);
                const answer = await connection.createAnswer();
                await connection.setLocalDescription(answer);
                await sendSignal(signal.from, { type: "answer", description: connection.localDescription?.toJSON() });
              } else if (signal.type === "answer" && signal.description) {
                await connection.setRemoteDescription(new RTCSessionDescription(signal.description));
                await addPendingCandidates(signal.from, connection);
              } else if (signal.type === "candidate" && signal.candidate) {
                if (connection.remoteDescription) {
                  await connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } else {
                  const pending = candidatesRef.current.get(signal.from) ?? [];
                  pending.push(signal.candidate);
                  candidatesRef.current.set(signal.from, pending);
                }
              }
            } catch (error: unknown) {
              console.error("Could not establish a participant's live meeting connection.", error);
              if (mountedRef.current) setCallError("A participant could not be connected. Leave the room and try again.");
            }
          })();
        })
        .on("presence", { event: "sync" }, () => {
          const presence = channel.presenceState<PresenceMember>();
          const peers = Object.values(presence).flat().filter((member) => member.userId !== user.id);
          const activePeerIds = new Set(peers.map((peer) => peer.userId));
          for (const [peerId, connection] of peersRef.current) {
            if (activePeerIds.has(peerId)) continue;
            connection.close();
            peersRef.current.delete(peerId);
            candidatesRef.current.delete(peerId);
            remoteStreamsRef.current.delete(peerId);
          }
          if (mountedRef.current) setRemoteStreams((current) => Object.fromEntries(Object.entries(current).filter(([peerId]) => activePeerIds.has(peerId))));
          if (mountedRef.current) setParticipants(peers.map((peer) => ({ ...peer, avatarPath: peer.avatarPath ?? null })));
          for (const peer of peers) {
            if (user.id.localeCompare(peer.userId) < 0) {
              const existing = peersRef.current.get(peer.userId);
              if (existing) continue;
              void (async () => {
                try {
                  const connection = createPeer(peer.userId);
                  const offer = await connection.createOffer();
                  await connection.setLocalDescription(offer);
                  await sendSignal(peer.userId, { type: "offer", description: connection.localDescription?.toJSON() });
                } catch (error: unknown) {
                  console.error("Could not create a live meeting connection offer.", error);
                  if (mountedRef.current) setCallError("The live call could not connect to a colleague. Please rejoin.");
                }
              })();
            }
          }
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            try {
              const trackStatus = await channel.track({ userId: user.id, name: room.user.name, role: room.user.role, avatarPath: room.user.avatarPath, screenSharing: false });
              if (trackStatus !== "ok") throw new Error("Your presence could not be announced to the meeting.");
              if (mountedRef.current) setInCall(true);
            } catch (error: unknown) {
              console.error("Could not announce meeting presence.", error);
              if (mountedRef.current) {
                setCallError(error instanceof Error ? error.message : "Your presence could not be announced to the meeting.");
                closeCall();
              }
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            console.error("Live meeting signaling channel failed.", status);
            if (mountedRef.current) {
              setCallError("The secure live meeting room could not connect. Confirm the meeting schema has been applied, then retry.");
              closeCall();
            }
          }
        });
    } catch (error: unknown) {
      console.error("Could not join live meeting.", error);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setLocalStream(null);
      setCallError(mediaErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  }

  function toggleMicrophone() {
    const nextMuted = !mutedRef.current;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
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
    if (!cameraOffRef.current) {
      const local = streamRef.current;
      const cameraTrack = local?.getVideoTracks()[0];
      if (!local || !cameraTrack) return;
      cameraTrack.onended = null;
      cameraTrack.stop();
      local.removeTrack(cameraTrack);
      setLocalStream(new MediaStream(local.getTracks()));
      try {
        if (!screenStreamRef.current) {
          await Promise.all([...peersRef.current.values()].map(async (connection) => {
            const sender = getVideoSender(connection);
            if (sender) await sender.replaceTrack(null);
          }));
        }
      } catch (error: unknown) {
        console.error("Could not stop sending the meeting camera.", error);
        setCallError("The camera is off, but some participants may need to reconnect to refresh your video.");
      }
      cameraOffRef.current = true;
      setCameraOff(true);
      return;
    }
    setCallError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not available in this browser.");
      const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const cameraTrack = camera.getVideoTracks()[0];
      const local = streamRef.current;
      if (!cameraTrack || !local) {
        camera.getTracks().forEach((track) => track.stop());
        throw new Error("The browser did not provide a camera video track.");
      }
      cameraTrack.onended = () => {
        if (local?.getTracks().some((track) => track.id === cameraTrack.id)) local.removeTrack(cameraTrack);
        cameraOffRef.current = true;
        if (mountedRef.current) {
          setCameraOff(true);
          setLocalStream(new MediaStream(local?.getTracks() ?? []));
          void Promise.all([...peersRef.current.values()].map(async (connection) => {
            const sender = getVideoSender(connection);
            if (sender) await sender.replaceTrack(null);
          })).catch((error: unknown) => {
            console.error("Could not stop the disconnected meeting camera track.", error);
            if (mountedRef.current) setCallError("Your camera disconnected. Participants may need to reconnect to refresh video.");
          });
        }
      };
      const endedTrack = local.getVideoTracks().find((track) => track.readyState !== "live");
      if (endedTrack) local.removeTrack(endedTrack);
      local.addTrack(cameraTrack);
      setLocalStream(new MediaStream(local.getTracks()));
      if (!screenStreamRef.current) {
        await Promise.all([...peersRef.current.values()].map(async (connection) => {
          const sender = getVideoSender(connection);
          if (sender) await sender.replaceTrack(cameraTrack);
        }));
      }
      cameraOffRef.current = false;
      setCameraOff(false);
    } catch (error: unknown) {
      console.error("Could not start meeting camera.", error);
      setCallError(mediaErrorMessage(error));
    }
  }

  async function updateScreenSharePresence(sharing: boolean) {
    const channel = channelRef.current;
    const presence = presenceDetailsRef.current;
    if (!channel || !presence) return;
    const status = await channel.track({ ...presence, screenSharing: sharing });
    if (status !== "ok") throw new Error("The screen-share status could not be sent to meeting participants.");
  }

  async function stopScreenShare() {
    const activeScreen = screenStreamRef.current;
    if (!activeScreen) return;
    screenStreamRef.current = null;
    activeScreen.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    setScreenStream(null);
    setScreenSharing(false);
    const cameraTrack = cameraOffRef.current
      ? null
      : streamRef.current?.getVideoTracks().find((track) => track.readyState === "live") ?? null;
    try {
      await Promise.all([...peersRef.current.values()].map(async (connection) => {
        const sender = getVideoSender(connection);
        if (sender) await sender.replaceTrack(cameraTrack);
      }));
      await updateScreenSharePresence(false);
    } catch (error: unknown) {
      console.error("Could not stop sharing the meeting screen cleanly.", error);
      if (mountedRef.current) setCallError(error instanceof Error ? error.message : "Your screen share stopped, but participants may need to reconnect.");
    }
  }

  async function toggleScreenShare() {
    if (screenShareBusy) return;
    if (screenStreamRef.current) {
      setScreenShareBusy(true);
      await stopScreenShare();
      setScreenShareBusy(false);
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCallError("Screen sharing is not supported by this browser. Use a current version of Chrome, Edge, or Firefox over HTTPS.");
      return;
    }
    setCallError("");
    setScreenShareBusy(true);
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const track = display.getVideoTracks()[0];
      if (!track) {
        display.getTracks().forEach((item) => item.stop());
        throw new Error("The browser did not provide a screen-share video track.");
      }
      screenStreamRef.current = display;
      setScreenStream(display);
      setScreenSharing(true);
      track.onended = () => { void stopScreenShare(); };
      await Promise.all([...peersRef.current.values()].map(async (connection) => {
        const sender = getVideoSender(connection);
        if (sender) await sender.replaceTrack(track);
      }));
      await updateScreenSharePresence(true);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      console.error("Could not start meeting screen share.", error);
      if (mountedRef.current) setCallError(error instanceof Error ? error.message : "The screen could not be shared.");
      await stopScreenShare();
    } finally {
      if (mountedRef.current) setScreenShareBusy(false);
    }
  }

  const canShareScreen = Boolean(
    window.isSecureContext
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getDisplayMedia === "function",
  );
  const isAdmin = user.role === "super_admin" || user.role === "management_admin";

  return (
    <section className="meeting-call surface-card" aria-label="Live meeting call">
      {!inCall ? (
        <div className="meeting-call__intro">
          <div><h3>Live meeting</h3><p>Join with your microphone. You can turn your camera on or off and share your screen at any time.</p></div>
          <button className="button button--primary" type="button" onClick={() => void joinCall()} disabled={connecting}>
            {connecting ? "Connecting…" : "Join meeting"}
          </button>
        </div>
      ) : (
        <>
          <div className="meeting-call__header">
            <div><h3>{meeting.title}</h3><p>{meeting.departmentName} · {participants.length + 1} in call</p></div>
            <span className="meeting-call__live">LIVE</span>
          </div>
          {isAdmin && <p className="meeting-call__notice">You are identified as an administrator in this call. Your microphone starts muted; you can unmute to speak.</p>}
          {callError && <div className="alert alert--error" role="alert">{callError}</div>}
          <div className="meeting-call__grid">
            {screenStream || !cameraOff
              ? <div className={`meeting-video-tile meeting-video-tile--local${screenSharing ? " meeting-video-tile--screen" : ""}`}><LocalVideo stream={screenStream ?? localStream} /><span className="meeting-video-tile__label">You{screenSharing ? " · Sharing screen" : ""}<SoundWave stream={localStream} /></span></div>
              : <AudioParticipantTile name={`You${isAdmin ? " · Administrator" : ""}`} role={user.role} avatarPath={user.avatarPath} stream={localStream ?? undefined} />}
            {participants.map((participant) => {
              const remote = remoteStreams[participant.userId];
              const hasVideo = Boolean(remote?.getVideoTracks().some((track) => track.readyState === "live" && !track.muted));
              return hasVideo
                ? <RemoteVideo key={participant.userId} name={`${participant.name}${participant.screenSharing ? " · Sharing screen" : participant.role === "super_admin" || participant.role === "management_admin" ? " · Administrator" : ""}`} stream={remote} audioStream={remote} muted={false} screenSharing={participant.screenSharing} />
                : <AudioParticipantTile key={participant.userId} name={participant.name} role={participant.role} avatarPath={participant.avatarPath} stream={remote} />;
            })}
            {!participants.length && <p className="meeting-call__waiting">You’re in the room. Waiting for others to join…</p>}
          </div>
          {turnConfigured === false && <p className="meeting-call__notice">Some restricted networks need administrator-configured TURN relay service for video and screen sharing.</p>}
          <div className="meeting-call__controls">
            <button className={`button ${muted ? "button--outline" : "button--primary"}`} type="button" onClick={toggleMicrophone}><span aria-hidden="true">{muted ? <MicOff size={16} /> : <Mic size={16} />}</span>{muted ? "Unmute" : "Mute"}</button>
            <button className={`button ${cameraOff ? "button--outline" : "button--primary"}`} type="button" onClick={() => void toggleCamera()} disabled={cameraBusy}><span aria-hidden="true">{cameraOff ? <VideoOff size={16} /> : <Video size={16} />}</span>{cameraBusy ? "Updating…" : cameraOff ? "Start camera" : "Stop camera"}</button>
            <button className={`button ${screenSharing ? "button--primary" : "button--outline"}`} type="button" onClick={() => void toggleScreenShare()} disabled={screenShareBusy || !canShareScreen} title={!canShareScreen ? "Screen capture is unavailable in this browser or device." : undefined}><span aria-hidden="true">{screenSharing ? <ScreenShareOff size={16} /> : <ScreenShare size={16} />}</span>{screenShareBusy ? "Updating…" : screenSharing ? "Stop sharing" : "Share screen"}</button>
            <button className="button button--danger" type="button" onClick={closeCall}><PhoneOff size={16} /> Leave call</button>
          </div>
          {!canShareScreen && <p className="meeting-call__notice">This browser or device does not provide screen capture. Try a desktop browser with screen-sharing support over HTTPS. Some mobile browsers do not support sharing the screen.</p>}
        </>
      )}
      {callError && !inCall && <div className="alert alert--error" role="alert">{callError}</div>}
    </section>
  );
}
