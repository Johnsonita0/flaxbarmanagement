import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

type Conversation = { name: string; snippet: string; time: string; initials: string };

export default function ChatPage() {
  const [active, setActive] = useState("General Meeting");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const conversations: Conversation[] = [
    { name: "General Meeting", snippet: "Please check the new schedule…", time: "10:42 AM", initials: "GM" },
    { name: "Management", snippet: "Thanks, I’ll review that.", time: "9:18 AM", initials: "MG" },
    { name: "Nengi Eze", snippet: "Are we ready for the shift?", time: "Yesterday", initials: "NE" },
    { name: "John Mensah", snippet: "Stock count is complete.", time: "Yesterday", initials: "JM" },
  ];
  return (
    <section className="module-page">
      <PageHeading title="Chat" description="Authorized staff conversations and team messages." />
      <PreviewNotice />
      <div className="chat-layout surface-card">
        <div className="chat-conversations"><label className="search-field"><MessageCircle size={15} /><input placeholder="Search conversations…" /></label>{conversations.map((item) => <button className={`conversation-row${active === item.name ? " conversation-row--active" : ""}`} key={item.name} onClick={() => setActive(item.name)}><span className="initial-avatar">{item.initials}</span><span className="record-row__main"><strong>{item.name}</strong><small>{item.snippet}</small></span><small className="conversation-row__time">{item.time}</small></button>)}</div>
        <div className="chat-thread"><div className="chat-thread__heading"><span className="initial-avatar">{conversations.find((item) => item.name === active)?.initials ?? "FB"}</span><div><strong>{active}</strong><small>Preview conversation · messages are not delivered</small></div></div><div className="message-list"><p className="message-date">TODAY</p><div className="chat-bubble chat-bubble--other"><small>Management · 9:12 AM</small><p>Team, please check the updated schedule for today.</p></div><div className="chat-bubble chat-bubble--mine"><small>You · 9:20 AM</small><p>Thanks, I have seen it.</p></div>{sent.map((text, index) => <div className="chat-bubble chat-bubble--mine" key={`${text}-${index}`}><small>You · preview</small><p>{text}</p></div>)}</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); const text = message.trim(); if (text) { setSent((current) => [...current, text]); setMessage(""); } }}><input value={message} onChange={(event) => setMessage(event.target.value)} aria-label="Message" placeholder="Type a message (preview only)" /><button aria-label="Add preview message" type="submit" disabled={!message.trim()}><Send size={17} /></button></form></div>
      </div>
    </section>
  );
}
