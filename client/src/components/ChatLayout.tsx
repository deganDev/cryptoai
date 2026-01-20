import { useState, type ReactNode } from "react";
import LogoMark from "./LogoMark";

type ChatLayoutProps = {
  children: ReactNode;
  variant?: "home" | "response";
  sessions?: Array<{ sessionId: string; title: string; lastMessageAt: string }>;
  onSelectSession?: (sessionId: string) => void;
  onNewChat?: () => void;
  userName?: string;
  userEmail?: string;
  userPhoto?: string | null;
  onShowSettings?: () => void;
  onShowLogout?: () => void;
  onDismissSettings?: () => void;
};

export default function ChatLayout({
  children,
  variant = "home",
  sessions = [],
  onSelectSession,
  onNewChat,
  userName,
  userEmail,
  userPhoto,
  onShowSettings,
  onShowLogout,
  onDismissSettings
}: ChatLayoutProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const initial =
    userName?.trim().charAt(0).toUpperCase() ??
    userEmail?.trim().charAt(0).toUpperCase() ??
    "U";

  const handleMouseLeave = () => {
    setIsExpanded(false);
  };

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${isExpanded ? "expanded" : ""} ${isMobileOpen ? "mobile-open" : ""}`}
        onMouseLeave={handleMouseLeave}
      >
        {isMobileOpen ? (
          <button
            className="mobile-close"
            type="button"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close sidebar"
          >
            ×
          </button>
        ) : null}
        <div className="sidebar-icons">
          <div className="sidebar-top">
            <div className="sidebar-logo">
              <LogoMark />
            </div>
            <button
              className="sidebar-action primary"
              aria-label="New chat"
              onClick={() => {
                onDismissSettings?.();
                onNewChat?.();
              }}
            >
              +
            </button>
            <button
              className="sidebar-action"
              aria-label="Messages"
              onMouseEnter={() => setIsExpanded(true)}
              onClick={onDismissSettings}
            >
              <span className="icon-bubble" />
            </button>
          </div>
          <div className="sidebar-bottom">
            <button
              className="sidebar-action ghost"
              aria-label="Settings"
              onClick={() => {
                onDismissSettings?.();
                onShowSettings?.();
              }}
            >
              <span className="icon-letter">{initial}</span>
            </button>
            <button
              className="sidebar-action ghost"
              aria-label="Sign out"
              onClick={() => {
                onDismissSettings?.();
                onShowLogout?.();
              }}
            >
              <span className="icon-exit" />
            </button>
          </div>
        </div>
        {isExpanded ? (
          <div className="sidebar-panel">
            <div className="sidebar-panel-header">
              <div>
                <div className="workspace-title">My Workspace</div>
                <div className="workspace-subtitle">Personal</div>
              </div>
              <div className="pin-placeholder" />
            </div>
            <button
              className="panel-new-chat"
              type="button"
              onClick={() => {
                onDismissSettings?.();
                onNewChat?.();
                setIsMobileOpen(false);
              }}
            >
              New Chat
            </button>
            <div className="drawer-title">Previous Chats</div>
            <div className="drawer-list">
              {sessions.map((session) => (
                <button
                  key={session.sessionId}
                  className="drawer-item"
                  type="button"
                  onClick={() => {
                    onDismissSettings?.();
                    onSelectSession?.(session.sessionId);
                    setIsMobileOpen(false);
                  }}
                >
                  {session.title}
                </button>
              ))}
            </div>
            <div className="sidebar-profile">
              <div className="profile-avatar">
                {userPhoto ? (
                  <img src={userPhoto} alt={userName ?? "User"} />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <div>
                <div className="profile-name">{userName ?? "Signed in"}</div>
                <div className="profile-email">{userEmail ?? ""}</div>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
      <main className={`main-panel ${variant === "response" ? "response-mode" : ""}`}>
        <button
          className="mobile-sidebar-toggle"
          type="button"
          onClick={() => setIsMobileOpen((prev) => !prev)}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        <div className="hero-mark">
          <LogoMark />
        </div>
        {children}
      </main>
    </div>
  );
}
