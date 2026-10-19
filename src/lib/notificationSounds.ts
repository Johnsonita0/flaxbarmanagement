export type NotificationSound = "call" | "message";

export interface NotificationSoundPreferences {
  calls: boolean;
  messages: boolean;
}

const defaultPreferences: NotificationSoundPreferences = {
  calls: false,
  messages: false,
};

let audioContext: AudioContext | null = null;

function preferenceKey(userId: string) {
  return `flexbar:notification-sounds:${userId}`;
}

export function getNotificationSoundPreferences(userId: string): NotificationSoundPreferences {
  try {
    const stored = window.localStorage.getItem(preferenceKey(userId));
    if (!stored) return defaultPreferences;
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof Reflect.get(parsed, "calls") === "boolean" &&
      typeof Reflect.get(parsed, "messages") === "boolean"
    ) {
      return { calls: Reflect.get(parsed, "calls"), messages: Reflect.get(parsed, "messages") };
    }
    console.error("Saved notification sound settings are invalid.");
  } catch (error: unknown) {
    console.error("Could not read notification sound settings.", error);
  }
  return defaultPreferences;
}

export function saveNotificationSoundPreferences(
  userId: string,
  preferences: NotificationSoundPreferences,
) {
  window.localStorage.setItem(preferenceKey(userId), JSON.stringify(preferences));
}

function getAudioContext() {
  if (!("AudioContext" in window)) {
    throw new Error("This browser does not support notification sounds.");
  }
  audioContext ??= new AudioContext();
  return audioContext;
}

export async function playNotificationTone(sound: NotificationSound) {
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();

  const notes = sound === "call"
    ? [{ frequency: 520, start: 0, duration: 0.2 }, { frequency: 660, start: 0.28, duration: 0.2 }, { frequency: 520, start: 0.56, duration: 0.32 }]
    : [{ frequency: 740, start: 0, duration: 0.12 }, { frequency: 880, start: 0.17, duration: 0.16 }];
  const now = context.currentTime;

  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
    gain.gain.setValueAtTime(0.0001, now + note.start);
    gain.gain.exponentialRampToValueAtTime(0.12, now + note.start + 0.02);
    gain.gain.setValueAtTime(0.12, now + note.start + note.duration - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + note.start);
    oscillator.stop(now + note.start + note.duration);
  }
}
