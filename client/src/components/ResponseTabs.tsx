type ResponseTabsProps = {
  active: "response" | "sources";
  onChange?: (value: "response" | "sources") => void;
};

export default function ResponseTabs({ active, onChange }: ResponseTabsProps) {
  return (
    <div className="response-tabs">
      {["response", "sources"].map((value) => (
        <button
          key={value}
          className={active === value ? "tab active" : "tab"}
          onClick={() => onChange?.(value as "response" | "sources")}
          type="button"
        >
          {value === "response" ? "Response" : "Sources"}
        </button>
      ))}
    </div>
  );
}
