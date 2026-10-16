import { Wine } from "lucide-react";
import "../css/Brand.css";

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <Wine size={22} strokeWidth={1.8} />
      </span>
      <span className="brand__name">FLEX BAR</span>
      {!compact && <span className="brand__subtitle">Staff &amp; Business Management</span>}
    </div>
  );
}
