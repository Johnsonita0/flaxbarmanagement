import { Plus } from "lucide-react";
import "./../css/PageChrome.css";

export default function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="module-page-heading">
      <div><p className="eyebrow">FLEX BAR · OPERATIONS</p><h1>{title}</h1><p>{description}</p></div>
      {action && <button className="button button--primary module-heading-action" onClick={action.onClick}><Plus size={16} />{action.label}</button>}
    </div>
  );
}
