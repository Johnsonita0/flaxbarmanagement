import { useEffect, useState } from "react";
import Brand from "./Brand";
import "../css/SplashScreen.css";

const newUserMessages = [
  "Warming up your Flex Bar experience.",
  "Getting your workspace ready.",
  "You’ll be ready to go in just a moment.",
];

const returningUserMessages = [
  "Welcome back — we’re picking up where you left off.",
  "Restoring your last workspace view.",
  "Your Flex Bar workspace is almost ready.",
];

const checkingUserMessages = [
  "Warming up your Flex Bar experience.",
  "Checking your workspace.",
  "You’ll be ready to go in just a moment.",
];

export default function SplashScreen({ returningUser }: { returningUser?: boolean }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % 3);
    }, 3_300);
    return () => window.clearInterval(interval);
  }, []);

  const messages =
    returningUser === undefined
      ? checkingUserMessages
      : returningUser
        ? returningUserMessages
        : newUserMessages;

  return (
    <main className="splash-screen" aria-label="Flex Bar loading">
      <div className="splash-screen__center">
        <Brand />
        <p className="splash-screen__message" aria-live="polite">{messages[messageIndex]}</p>
        <p className="splash-screen__tagline">People <span>·</span> Operations <span>·</span> Growth</p>
        <span className="splash-screen__progress" aria-hidden="true"><i /></span>
      </div>
      <div className="splash-screen__waves" aria-hidden="true">
        <span className="splash-screen__wave splash-screen__wave--back" />
        <span className="splash-screen__wave splash-screen__wave--front" />
      </div>
    </main>
  );
}
