type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Search price, trace an address, or scan token risk",
  disabled = false
}: ChatInputProps) {
  return (
    <div className="search-shell">
      <textarea
        className="search-input"
        placeholder={placeholder}
        rows={3}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="search-actions">
   
        <button className="ask-button" type="button" onClick={onSubmit} disabled={disabled}>
          {disabled ? "Thinking..." : "Ask Crypto AI"}
        </button>
      </div>
    </div>
  );
}
