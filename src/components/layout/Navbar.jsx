import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useFactory } from "../../contexts/FactoryContext";
import Button from "../ui/Button";
import ThemeToggle from "../ui/ThemeToggle";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/workers", label: "Workers" },
  { to: "/beams", label: "Beams" },
  { to: "/production", label: "Production" },
  { to: "/reports", label: "Reports" },
];

export default function Navbar({ factoryName }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { clearFactorySelection } = useFactory();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    try {
      await signOut(auth);
      sessionStorage.clear();
      clearFactorySelection();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      window.alert("Logout failed. Please try again.");
    }
  }

  return (
    <>
      <div className="mobile-bar">
        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle navigation"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="brand-lockup brand-lockup--mobile">
          <div className="logo-mark">L</div>
          <div>
            <div className="brand-lockup__title">LoomTrack</div>
            <div className="brand-lockup__meta">{factoryName || "Factory workspace"}</div>
          </div>
        </div>
        <ThemeToggle compact className="mobile-bar__theme-toggle" />
      </div>
      <button
        type="button"
        aria-label="Close navigation"
        className={`sidebar-backdrop ${isMenuOpen ? "sidebar-backdrop--visible" : ""}`.trim()}
        onClick={() => setIsMenuOpen(false)}
      />
      <aside className={`sidebar ${isMenuOpen ? "sidebar--open" : ""}`.trim()}>
        <div className="sidebar__brand">
          <div className="brand-lockup">
            <div className="logo-mark">L</div>
            <div>
              <div className="brand-lockup__title">LoomTrack</div>
              <div className="brand-lockup__meta">{factoryName || "Factory workspace"}</div>
            </div>
          </div>
        </div>
        <div className="sidebar__section-label">Operations</div>
        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`.trim()
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <ThemeToggle className="sidebar__theme-toggle" />
          <div className="sidebar__meta-card">
            <span className="sidebar__meta-label">Active factory</span>
            <strong>{factoryName || "Factory workspace"}</strong>
          </div>
          <Button type="button" variant="secondary" block onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </aside>
    </>
  );
}
