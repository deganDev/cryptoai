import { useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User
} from "firebase/auth";
import ChatLayout from "./components/ChatLayout";
import ChatInput from "./components/ChatInput";
import QuickActions from "./components/QuickActions";
import ResponseView from "./components/ResponseView";
import type { ChatResponse } from "./types";
import { auth, googleProvider } from "./firebase";

type ChatEntry = {
  id: string;
  prompt: string;
  response: ChatResponse | null;
  answerText: string;
  isLoading: boolean;
  isSearching: boolean;
  isTyping: boolean;
  error?: string | null;
};

export default function App() {
  const createId = () => {
    if (typeof window !== "undefined" && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const typingRef = useRef<{ id: string; timer: number } | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<
    Array<{ sessionId: string; title: string; lastMessageAt: string }>
  >([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{
    name: string | null;
    email: string | null;
    picture: string | null;
    preferredName?: string | null;
  } | null>(null);
  const [showLogout, setShowLogout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferredNameInput, setPreferredNameInput] = useState("");
  const [fullNameInput, setFullNameInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const showResponse = entries.length > 0 || isSubmitting;

  const updateEntry = (id: string, patch: Partial<ChatEntry>) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  };

  const stopTypewriter = () => {
    if (typingRef.current) {
      window.clearInterval(typingRef.current.timer);
      updateEntry(typingRef.current.id, { isTyping: false });
      typingRef.current = null;
    }
  };

  const startTypewriter = (id: string, text: string) => {
    stopTypewriter();
    updateEntry(id, { isTyping: true, answerText: "" });
    let index = 0;
    const timer = window.setInterval(() => {
      index += 2;
      if (index >= text.length) {
        updateEntry(id, { answerText: text, isTyping: false });
        stopTypewriter();
        return;
      }
      updateEntry(id, { answerText: text.slice(0, index) });
    }, 12);
    typingRef.current = { id, timer };
  };

  const getAuthToken = async () => {
    if (!auth.currentUser) {
      return null;
    }
    return auth.currentUser.getIdToken();
  };

  const handleStream = async (message: string, entryId: string) => {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("Login required.");
    }
    const res = await fetch("/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message, sessionId })
    });

    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    if (!res.body) {
      const data = (await res.json()) as ChatResponse;
      updateEntry(entryId, {
        response: data,
        answerText: data.answer_md,
        isLoading: false,
        isSearching: false,
        isTyping: false
      });
      setSessionId(data.sessionId);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = raw.split("\n");
        let event = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }
        const data = dataLines.join("\n");
        if (event === "status") {
          updateEntry(entryId, { isSearching: true });
        }
        if (event === "result") {
          const parsed = JSON.parse(data) as ChatResponse;
          setSessionId(parsed.sessionId);
          updateEntry(entryId, {
            response: parsed,
            isLoading: false,
            isSearching: false
          });
          startTypewriter(entryId, parsed.answer_md ?? "");
        }
        if (event === "error") {
          updateEntry(entryId, {
            error: data || "Stream error.",
            isLoading: false,
            isSearching: false
          });
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    updateEntry(entryId, { isSearching: false, isLoading: false });
  };

  const handleSubmit = async () => {
    const message = draft.trim();
    if (!message || isSubmitting) {
      return;
    }
    const entryId = createId();
    const newEntry: ChatEntry = {
      id: entryId,
      prompt: message,
      response: null,
      answerText: "",
      isLoading: true,
      isSearching: false,
      isTyping: false,
      error: null
    };
    setEntries((prev) => [...prev, newEntry]);
    setIsSubmitting(true);
    stopTypewriter();

    try {
      await handleStream(message, entryId);
      setDraft("");
      await loadSessions();
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : "Something went wrong.";
      updateEntry(entryId, {
        error: messageText,
        isLoading: false,
        isSearching: false
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [entries.length]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        loadSessions();
        loadProfile();
      } else {
        setSessions([]);
        setEntries([]);
        setSessionId(undefined);
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadSessions = async () => {
    const token = await getAuthToken();
    if (!token) {
      return;
    }
    const res = await fetch("/api/sessions", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as {
      sessions: Array<{ sessionId: string; title: string; lastMessageAt: string }>;
    };
    setSessions(data.sessions);
  };

  const loadProfile = async () => {
    const token = await getAuthToken();
    if (!token) {
      return;
    }
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as {
      name: string | null;
      email: string | null;
      picture: string | null;
      preferredName?: string | null;
    };
    setUserProfile(data);
    setPreferredNameInput(data.preferredName ?? "");
    setFullNameInput(data.name ?? "");
  };

  const loadSessionTurns = async (targetSessionId: string) => {
    const token = await getAuthToken();
    if (!token) {
      return;
    }
    const res = await fetch(`/api/sessions/${targetSessionId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as {
      sessionId: string;
      turns: Array<{ prompt: string; response: ChatResponse }>;
    };
    const mapped: ChatEntry[] = data.turns.map((turn) => ({
      id: createId(),
      prompt: turn.prompt,
      response: turn.response,
      answerText: turn.response.answer_md ?? "",
      isLoading: false,
      isSearching: false,
      isTyping: false
    }));
    setEntries(mapped);
    setSessionId(targetSessionId);
  };

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Login failed. Try again.";
      setAuthError(message);
      await signInWithRedirect(auth, googleProvider);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setShowLogout(false);
  };

  const updateProfile = async (payload: {
    preferredName?: string;
    name?: string;
  }) => {
    const token = await getAuthToken();
    if (!token) {
      return;
    }
    setSaveStatus("Saving...");
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      setSaveStatus("Save failed.");
      return;
    }
    const data = (await res.json()) as {
      name: string | null;
      email: string | null;
      picture: string | null;
      preferredName?: string | null;
    };
    setUserProfile(data);
    setPreferredNameInput(data.preferredName ?? "");
    setFullNameInput(data.name ?? "");
    setSaveStatus("Saved.");
    window.setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleNewChat = () => {
    setEntries([]);
    setSessionId(undefined);
  };

  const greetingName =
    userProfile?.preferredName ?? userProfile?.name ?? user?.displayName ?? "there";
  const firstName = greetingName.trim().split(/\s+/)[0] ?? "there";
  return (
    <ChatLayout
      variant={showResponse ? "response" : "home"}
      sessions={sessions}
      onSelectSession={loadSessionTurns}
      onNewChat={handleNewChat}
      userName={userProfile?.name ?? user?.displayName ?? ""}
      userEmail={userProfile?.email ?? user?.email ?? ""}
      userPhoto={userProfile?.picture ?? user?.photoURL ?? null}
      onShowSettings={() => setShowSettings(true)}
      onShowLogout={() => setShowLogout(true)}
      onDismissSettings={() => setShowSettings(false)}
    >
      {showSettings ? (
        <section className="settings-page">
          <div className="settings-page-header">
            <button
              className="settings-back"
              type="button"
              onClick={() => setShowSettings(false)}
            >
              Back
            </button>
            <h2>Settings</h2>
          </div>
          <div className="settings-grid">
            <aside className="settings-nav">
              <div className="settings-nav-title">General</div>
              <button className="settings-nav-item">General</button>
            </aside>
            <div className="settings-content">
              <div className="settings-card">
                <h4>Account</h4>
                <div className="settings-row">
                  <div className="settings-avatar">
                    {userProfile?.picture || user?.photoURL ? (
                      <img
                        src={userProfile?.picture ?? user?.photoURL ?? ""}
                        alt={userProfile?.name ?? user?.displayName ?? "User"}
                      />
                    ) : (
                      <span>{firstName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="settings-inputs">
                    <label>
                      <span>Your preferred name</span>
                      <input
                        type="text"
                        value={preferredNameInput}
                        onChange={(event) => setPreferredNameInput(event.target.value)}
                        placeholder="Your preferred name"
                      />
                    </label>
                    <button
                      className="settings-action"
                      type="button"
                      onClick={() =>
                        updateProfile({ preferredName: preferredNameInput })
                      }
                    >
                      Save preferred name
                    </button>
                  </div>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-label">Full Name</div>
                    <input
                      className="settings-text"
                      type="text"
                      value={fullNameInput}
                      onChange={(event) => setFullNameInput(event.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <button
                    className="settings-action"
                    type="button"
                    onClick={() => updateProfile({ name: fullNameInput })}
                  >
                    Change full name
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-label">Email Address</div>
                    <div className="settings-value">
                      {userProfile?.email ?? user?.email ?? "Unknown"}
                    </div>
                  </div>
                </div>
                {saveStatus ? <div className="settings-status">{saveStatus}</div> : null}
              </div>
              <div className="settings-card">
                <h4>System</h4>
                <div className="settings-row">
                  <div>
                    <div className="settings-label">You are signed in as</div>
                    <div className="settings-value">
                      {userProfile?.email ?? user?.email ?? ""}
                    </div>
                  </div>
                  <button
                    className="settings-action"
                    type="button"
                    onClick={() => setShowLogout(true)}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : showResponse ? (
        <div className="response-feed">
          {entries.map((entry, index) => (
            <ResponseView
              key={entry.id}
              prompt={entry.prompt}
              response={entry.response}
              answer={entry.isTyping ? entry.answerText : entry.answerText || entry.response?.answer_md || ""}
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={handleSubmit}
              isLoading={entry.isLoading}
              isSearching={entry.isSearching}
              isTyping={entry.isTyping}
              error={entry.error}
              showInput={index === entries.length - 1}
            />
          ))}
          <div ref={feedEndRef} />
        </div>
      ) : (
        <section className="hero">
          <h1 className="hero-title">
            {`Hi ${firstName}, What are you tracking on-chain today?`}
          </h1>
          <ChatInput
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            disabled={isSubmitting}
          />
          <QuickActions />
        </section>
      )}
      {!user ? (
        <div className="auth-overlay">
          <div className="auth-modal">
            <h3>Sign up to continue</h3>
            <button className="auth-google" type="button" onClick={handleLogin}>
              Continue with Google
            </button>
            {authError ? <p className="auth-error">{authError}</p> : null}
            <p>By continuing, you agree to Cryptolab&apos;s Privacy Policy.</p>
          </div>
        </div>
      ) : null}
      {showLogout ? (
        <div className="auth-overlay">
          <div className="logout-modal">
            <div className="logout-header">
              <h3>Are you sure you want to sign out?</h3>
              <button
                className="logout-close"
                type="button"
                onClick={() => setShowLogout(false)}
              >
                ×
              </button>
            </div>
            <div className="logout-actions">
              <button
                className="logout-cancel"
                type="button"
                onClick={() => setShowLogout(false)}
              >
                Cancel
              </button>
              <button className="logout-confirm" type="button" onClick={handleLogout}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ChatLayout>
  );
}
