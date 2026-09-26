// /dashboard — the command center on its own, with the app chrome.
//
// The body of this page is the pre-existing V33-V37 dashboard, now extracted to
// components/command/CommandCenter.jsx so the landing page can embed the same
// component instead of duplicating it.
//
// AppShell already renders <main id="main-content">, so this page must not emit
// a second one: two main landmarks with a duplicate id break the skip-link
// target and fail the audit.
import { CommandCenter } from '../components/command/CommandCenter.jsx';

export default function Dashboard() {
  return (
    <div className="bg-bg-primary titan-motion-page">
      <CommandCenter />
    </div>
  );
}
