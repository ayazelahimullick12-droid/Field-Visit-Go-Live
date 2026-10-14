import React, { useState, useEffect } from "react";
import { MapPin, ShieldAlert, User, Hash, Lock, LogIn } from "lucide-react";
import { usePersistedCollection } from "../lib/usePersistedCollection";
import { useTheme } from "../lib/theme";
import ThemeToggle from "../lib/ThemeToggle";
import AuthScreen from "../lib/AuthScreen";
import BdOutline from "../lib/BdOutline";

// Session keys — kept identical to what the staff and admin apps read, so
// signing in here and landing on staff.html / admin.html needs no re-login.
const STAFF_SESSION_KEY = "fvt-staff-session"; // employee id, localStorage
const ADMIN_SESSION_KEY = "fvt-admin-session"; // admin id, sessionStorage

// Major cities, [lng, lat] — decorative pins on the sign-in map.
const CITY_PINS = [[90.41, 23.81], [91.78, 22.36], [91.87, 24.89], [88.6, 24.37], [89.54, 22.85], [89.27, 25.74], [90.35, 22.7], [90.42, 24.75], [92.0, 21.43]];

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [role, setRole] = useState("user"); // "user" | "admin"

  const [employees, setEmployees, employeesLoaded] = usePersistedCollection("employees", []);
  const [adminUsers, , adminUsersLoaded] = usePersistedCollection("adminUsers", []);

  const existingStaffSessionId = (() => {
    try { return localStorage.getItem(STAFF_SESSION_KEY); } catch { return null; }
  })();
  const existingAdminSessionId = (() => {
    try { return sessionStorage.getItem(ADMIN_SESSION_KEY); } catch { return null; }
  })();

  const staffMatch = existingStaffSessionId && employeesLoaded
    ? employees.find((e) => e.id === existingStaffSessionId)
    : undefined;
  const adminMatch = existingAdminSessionId && adminUsersLoaded
    ? adminUsers.find((a) => a.id === existingAdminSessionId)
    : undefined;

  // Already signed in somewhere? Skip the login screen entirely.
  useEffect(() => {
    if (staffMatch) { window.location.replace("/staff.html"); return; }
    if (adminMatch) { window.location.replace("/admin.html"); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffMatch, adminMatch]);

  // Keep showing a loading state (never the form) for as long as a session
  // might still turn out to be valid — either the collection hasn't loaded
  // yet, or it has and the redirect above is about to fire.
  const waitingOnStaffSession = existingStaffSessionId && (!employeesLoaded || staffMatch);
  const waitingOnAdminSession = existingAdminSessionId && (!adminUsersLoaded || adminMatch);
  if (waitingOnStaffSession || waitingOnAdminSession) {
    return (
      <div className="fvt">
        <div className="session-loading"><div className="brand-mark"><MapPin size={20} /></div></div>
      </div>
    );
  }

  const handleStaffLogin = (employee) => {
    try { localStorage.setItem(STAFF_SESSION_KEY, employee.id); } catch { /* ignore */ }
    window.location.href = "/staff.html";
  };

  const handleStaffRegister = (newEmployee) => {
    setEmployees((es) => [...es, newEmployee]);
    try { localStorage.setItem(STAFF_SESSION_KEY, newEmployee.id); } catch { /* ignore */ }
    window.location.href = "/staff.html";
  };

  const handleAdminLogin = (admin) => {
    try { sessionStorage.setItem(ADMIN_SESSION_KEY, admin.id); } catch { /* ignore */ }
    window.location.href = "/admin.html";
  };

  return (
    <div className="fvt">
      <div className="auth-shell">
        <section className="auth-art">
          <div className="brand">
            <div className="brand-mark"><MapPin size={19} /></div>
            <div>
              <div className="brand-name">Field Visit Tracker</div>
              <div className="brand-sub">BRAC · Head Office</div>
            </div>
          </div>

          <BdOutline className="auth-map" pins={CITY_PINS} />
        </section>

        <section className="auth-panel">
          <div className="auth-panel-top"><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
          <div style={{ width: "100%", maxWidth: 420 }}>
            <div className="role-picker">
              <button className={`role-picker-btn ${role === "user" ? "active" : ""}`} onClick={() => setRole("user")}>
                <User size={15} /> User
              </button>
              <button className={`role-picker-btn ${role === "admin" ? "active" : ""}`} onClick={() => setRole("admin")}>
                <ShieldAlert size={15} /> Admin
              </button>
            </div>

            <div key={role}>
              {role === "user" ? (
                <AuthScreen
                  embedded
                  employees={employees}
                  onRegister={handleStaffRegister}
                  onLogin={handleStaffLogin}
                  icon={<MapPin size={22} />}
                  title="Welcome back"
                  subtitle="Sign in to log and review field visits"
                  demoHint="Demo: Base user 1234 / password123 · Fixer 3001 / fixer123 · Management 7001 / mgmt123"
                />
              ) : (
                <AdminLoginCard adminUsers={adminUsers} onLogin={handleAdminLogin} />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Admins sign in the same way as everyone else: PIN and password.
function AdminLoginCard({ adminUsers, onLogin }) {
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    if (!pin.trim() || !password.trim()) {
      setError("Enter your admin PIN and password.");
      return;
    }
    const match = adminUsers.find((a) => a.pin === pin.trim() && a.password === password);
    if (!match) {
      setError("No admin account matches that PIN and password.");
      return;
    }
    onLogin(match);
  };

  return (
    <div className="login-card">
      <div className="login-logo"><ShieldAlert size={22} /></div>
      <h1 className="login-title">Admin console</h1>
      <p className="login-sub">Action items, employees, offices and settings</p>

      <div className="field-group">
        <label className="field-label" htmlFor="admin-pin">Admin PIN</label>
        <div className="login-input-wrap">
          <Hash size={16} className="login-input-icon" />
          <input id="admin-pin" className="input login-input" type="text" inputMode="numeric" placeholder="4–8 digits" autoComplete="username"
                 value={pin} onChange={(e) => setPin(e.target.value)} />
        </div>
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="admin-password">Password</label>
        <div className="login-input-wrap">
          <Lock size={16} className="login-input-icon" />
          <input id="admin-password" className="input login-input" type="password" placeholder="Password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 20 }} onClick={handleLogin}>
        <LogIn size={16} /> Sign in
      </button>
      <p className="login-footer">Demo: PIN 9001 / admin123</p>
    </div>
  );
}
