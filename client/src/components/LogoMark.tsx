export default function LogoMark() {
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Zarklab logo"
    >
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6ef3ff" />
          <stop offset="55%" stopColor="#7b5cff" />
          <stop offset="100%" stopColor="#ff7ee6" />
        </linearGradient>
      </defs>
      <path
        d="M12 10h40l-12 14 12 30H12l16-20-16-24z"
        fill="url(#logoGradient)"
      />
      <path
        d="M26 26h16l-6 10 6 12H22l8-10-8-12z"
        fill="#121215"
        opacity="0.9"
      />
    </svg>
  );
}
