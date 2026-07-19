// V21: Footer — last-updated timestamp + version + status link.
import { useEffect, useState } from 'react';
import { Github, Activity } from 'lucide-react';

export function Footer() {
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('titan.lastUpdated.v1');
    if (stored) setLastUpdated(stored);
  }, []);

  return (
    <footer className="border-t border-border-subtle mt-8 py-3 px-4 md:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap text-[10px] text-text-muted">
        <div className="flex items-center gap-3 flex-wrap">
          <span>TITAN V21.0</span>
          <span className="hidden sm:inline">· Marketing Intelligence</span>
          {lastUpdated && (
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-accent-success" />
              Update {new Date(lastUpdated).toLocaleString('id-ID', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          )}
        </div>
        <a
          href="https://github.com/tltanpro/TITAN"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-text-primary transition-colors"
        >
          <Github className="w-3 h-3" />
          GitHub
        </a>
      </div>
    </footer>
  );
}
