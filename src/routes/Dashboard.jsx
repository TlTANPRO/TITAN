// /dashboard — the command center on its own, with the app chrome.
//
// The body of this page is the pre-existing V33-V37 dashboard, now extracted to
// components/command/CommandCenter.jsx so the landing page can embed the same
// component instead of duplicating it.
import { CommandCenter } from '../components/command/CommandCenter.jsx';

export default function Dashboard() {
  return (
    <div className="bg-bg-primary">
      <main id="main-content" tabIndex={-1} className="pb-20 sm:pb-6">
        <CommandCenter />
      </main>
    </div>
  );
}
