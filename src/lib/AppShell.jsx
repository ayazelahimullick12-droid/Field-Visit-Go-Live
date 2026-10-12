import React, { useEffect, useRef, useState } from "react";
import { MapPin, Search, LogOut, Moon, Sun } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

/**
 * Navigation shell shared by the staff app and the admin console.
 * Desktop (900px and up): a sidebar on the left with the brand, the main action,
 * the pages, search, and the signed-in user at the bottom — the layout most
 * web apps use. Mobile: a compact top bar plus a floating bottom tab bar with a
 * raised primary-action button.
 */
export default function AppShell({
  theme, onToggleTheme, brandSub = "BRAC · Head Office", tabs, active, pageKey, onTab,
  fab, onSearch, user, userSub, onLogout, children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const initials = (user || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const FabIcon = fab?.icon;

  // Bottom bar: the raised action button sits in the middle of the tabs.
  const mid = Math.min(2, Math.ceil(tabs.length / 2));
  const bottom = fab ? [...tabs.slice(0, mid), { __fab: true }, ...tabs.slice(mid)] : tabs;

  const brand = (
    <div className="brand">
      <div className="brand-mark"><MapPin size={19} /></div>
      <div>
        <div className="brand-name">Field Visit Tracker</div>
        <div className="brand-sub">{brandSub}</div>
      </div>
    </div>
  );

  return (
    <>
      {/* desktop: sidebar */}
      <aside className="sidebar" aria-label="Sidebar">
        <div className="sb-top">{brand}</div>
        {fab && (
          <button className="sb-cta" onClick={fab.onClick}>{FabIcon && <FabIcon size={17} strokeWidth={2.6} />} {fab.label}</button>
        )}
        <nav className="sb-nav" aria-label="Main">
          {tabs.map((t) => (
            <button key={t.key} className={`sb-item ${active === t.key ? "active" : ""}`} aria-current={active === t.key ? "page" : undefined} onClick={() => onTab(t.key)}>
              <t.icon size={18} /> <span className="sb-label">{t.label}</span>
              {t.count > 0 && <span className="tab-count">{t.count}</span>}
            </button>
          ))}
        </nav>
        <div className="sb-foot">
          {onSearch && (
            <button className="sb-item" onClick={onSearch}>
              <Search size={18} /> <span className="sb-label">Search</span> <span className="sb-kbd">Ctrl K</span>
            </button>
          )}
          <button className="sb-item" onClick={onToggleTheme}>
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />} <span className="sb-label">{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          <div className="sb-user">
            <div className="avatar" title={user}>{initials}</div>
            <div className="sb-user-tx">
              <div className="sb-user-name">{user}</div>
              {userSub && <div className="sb-user-sub">{userSub}</div>}
            </div>
            <button className="icon-btn" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* mobile: top bar */}
      <header className="topbar">
        <div className="topbar-inner">
          {brand}
          <div className="topbar-right">
            {onSearch && (
              <button className="icon-btn" onClick={onSearch} aria-label="Search" title="Search">
                <Search size={17} />
              </button>
            )}
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <div className="user-wrap" ref={wrapRef}>
              <button className="user-btn" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account">
                <div className="avatar" title={user}>{initials}</div>
              </button>
              {menuOpen && (
                <div className="user-menu" role="menu">
                  <div className="um-head">
                    <div className="um-name">{user}</div>
                    {userSub && <div className="um-sub">{userSub}</div>}
                  </div>
                  <button className="um-item" role="menuitem" onClick={() => { onToggleTheme(); setMenuOpen(false); }}>
                    {theme === "light" ? <Moon size={16} /> : <Sun size={16} />} {theme === "light" ? "Dark mode" : "Light mode"}
                  </button>
                  <button className="um-item danger" role="menuitem" onClick={onLogout}><LogOut size={16} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="shell-main">
        <div key={pageKey ?? active} className="page-enter">{children}</div>
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {bottom.map((t) =>
          t.__fab ? (
            <button key="fab" className="bn-fab" onClick={fab.onClick} aria-label={fab.label}>
              {FabIcon && <FabIcon size={24} strokeWidth={2.6} />}
            </button>
          ) : (
            <button key={t.key} className={`bn-item ${active === t.key ? "active" : ""}`} onClick={() => onTab(t.key)}>
              <t.icon size={20} />
              {t.short || t.label}
              {t.count > 0 && <span className="bn-count">{t.count}</span>}
            </button>
          )
        )}
      </nav>
    </>
  );
}
