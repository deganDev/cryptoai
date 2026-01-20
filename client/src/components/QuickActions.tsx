const ACTIONS = [
  { title: "Upload", icon: "upload" },
  { title: "Create Folder", icon: "plus" },
  { title: "Chat with file", icon: "image" },
  { title: "Chat with folder", icon: "folder" }
];

export default function QuickActions() {
  return (
    <section className="quick-actions">
      <div className="quick-actions-header">
        <span>Quick actions</span>
        <div className="quick-divider" />
      </div>
      <div className="quick-grid">
        {ACTIONS.map((action) => (
          <button className="quick-card" key={action.title} type="button">
            <span className={`quick-icon ${action.icon}`} aria-hidden="true" />
            <span>{action.title}</span>
            <span className="quick-overlay">Coming soon</span>
          </button>
        ))}
      </div>
    </section>
  );
}
