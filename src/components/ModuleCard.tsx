import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "../css/ModuleCard.css";

export default function ModuleCard({
  icon: Icon,
  title,
  description,
  accent,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button className="module-card" onClick={onClick}>
      <span className={`module-card__icon module-card__icon--${accent}`}><Icon size={19} strokeWidth={1.8} /></span>
      <span className="module-card__text"><strong>{title}</strong><small>{description}</small></span>
      <ArrowUpRight size={16} className="module-card__arrow" />
    </button>
  );
}
