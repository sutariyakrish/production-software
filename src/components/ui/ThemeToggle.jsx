import { useTheme } from "../../contexts/ThemeContext";

export default function ThemeToggle({ className = "", compact = false }) {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <button type="button" className={`theme-toggle ${compact ? "theme-toggle--compact" : ""} ${className}`.trim()} aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`} aria-pressed={isDarkMode} onClick={toggleTheme}>
      <span className="theme-toggle__track" aria-hidden="true"><span className="theme-toggle__thumb" /></span>
      {compact ? <span className="visually-hidden">Dark mode</span> : <span className="theme-toggle__copy"><span className="theme-toggle__label">Dark mode</span><span className="theme-toggle__value">{isDarkMode ? "On" : "Off"}</span></span>}
    </button>
  );
}
