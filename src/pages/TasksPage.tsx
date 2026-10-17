import { ClipboardList } from "lucide-react";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

export default function TasksPage() {
  return (
    <section className="module-page">
      <PageHeading title="Tasks" description="Work assigned to staff and departments." />
      <div className="surface-card feature-unavailable" role="status">
        <span className="task-icon task-icon--amber"><ClipboardList size={20} /></span>
        <div>
          <h2>Task management is not connected</h2>
          <p>There are no live task records available yet. Task creation and progress updates are disabled until this module is connected to saved operations data.</p>
        </div>
      </div>
    </section>
  );
}
