import { Eye } from "lucide-react";
import "./../css/PageChrome.css";

export default function PreviewNotice() {
  return (
    <div className="preview-notice">
      <Eye size={15} />
      <span>UI preview — sample records only. This screen is not connected to live operations yet.</span>
    </div>
  );
}
