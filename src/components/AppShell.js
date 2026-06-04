"use client";

// Responsive app shell: sidebar rail on desktop, bottom tab bar on mobile.
// Pure presentation — pages wrap their content in <AppShell active="..." onSignOut={...}>.

import { useRouter } from "next/navigation";

const NAV = [
  { key: "dashboard", label: "Studio", href: "/", icon: IconSpark },
  { key: "ideas", label: "Ideas", href: "/ideas", icon: IconBulb },
  { key: "insights", label: "Insights", href: "/insights", icon: IconChart },
  { key: "bootstrap", label: "Brand", href: "/bootstrap", icon: IconWand },
  { key: "settings", label: "Settings", href: "/settings", icon: IconGear },
];

function IconChart(props) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></svg>);
}

export function AppShell({ active, onSignOut, children }) {
  const router = useRouter();
  const go = (href) => router.push(href);

  return (
    <div className="shell">
      {/* Desktop sidebar */}
      <aside className="rail">
        <div className="brand"><span className="brand-mark">◆</span> Cadence</div>
        <nav className="rail-nav">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <a key={n.key} className={`rail-link ${active === n.key ? "active" : ""}`} onClick={() => go(n.href)}>
                <Icon /> {n.label}
              </a>
            );
          })}
        </nav>
        <div className="rail-foot">
          <a className="rail-link" onClick={onSignOut}><IconOut /> Sign out</a>
        </div>
      </aside>

      <div>
        {/* Mobile top bar */}
        <header className="topbar">
          <div className="brand"><span className="brand-mark">◆</span> Cadence</div>
          <div className="topbar-actions">
            <button className="btn btn-soft btn-sm" onClick={onSignOut}>Sign out</button>
          </div>
        </header>

        {children}

        {/* Mobile bottom tabs */}
        <nav className="tabbar">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.key} className={`tab ${active === n.key ? "active" : ""}`} onClick={() => go(n.href)}>
                <Icon />
                <span>{n.label}</span>
                <span className="tab-dot" />
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/* ---- icons (inline, stroke-based) ---- */
function IconSpark() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeLinecap="round"/><path d="M12 8.5 13.2 11l2.5 1-2.5 1L12 15.5 10.8 13l-2.5-1 2.5-1L12 8.5Z"/></svg>);
}
function IconBulb() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3Z"/></svg>);
}
function IconWand() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="m4 20 10-10M14 6l1.5-1.5M18 10l1.5-1.5M15 4l.7 2 2 .7-2 .7L15 10l-.7-2.1-2-.7 2-.7L15 4Z"/></svg>);
}
function IconGear() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>);
}
function IconOut() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>);
}
