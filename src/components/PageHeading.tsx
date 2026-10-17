import { ArrowLeft, Plus } from "lucide-react";
import { usePageBack } from "./PageNavigationContext";
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
  const onBack = usePageBack();
  return (
    <div className="module-page-heading">
      <div className="module-page-heading__content">
        {onBack && <button className="module-page-back" type="button" onClick={onBack}><ArrowLeft size={15} />Back</button>}
        <p className="eyebrow">FLEX BAR · OPERATIONS</p><h1>{title}</h1><p>{description}</p>
      </div>
      {action && <button className="button button--primary module-heading-action" onClick={action.onClick}><Plus size={16} />{action.label}</button>}
    </div>
  );
}
