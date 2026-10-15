import React from "react";
import { LayoutDashboard } from "lucide-react";
import { MANAGEMENT_TAB_TOGGLES, managementTabOn } from "../lib/features";

/** Admin → Features: switch parts of the app on or off without a code change. */
export default function FeaturesTab({ settings, setSettings, showToast }) {
  const toggle = (key) => {
    const on = !managementTabOn(settings, key);
    setSettings({ ...settings, managementTabs: { ...(settings?.managementTabs || {}), [key]: on } });
    showToast(`${MANAGEMENT_TAB_TOGGLES.find((t) => t.key === key).label} ${on ? "switched on" : "switched off"} for management users.`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Configuration</p>
          <h1 className="h-title">Features</h1>
          <p className="h-desc">Switch parts of the app on or off for everyone. Changes apply the next time a page loads.</p>
        </div>
      </div>

      <section className="card card-pad">
        <p className="analytics-card-title">Management section</p>
        <p className="analytics-card-sub">Tabs shown to employees with the Management role.</p>

        <div className="feature-row locked">
          <span className="hub-ico ico-route"><LayoutDashboard size={17} /></span>
          <span className="fr-text"><b>Summary</b><small>Programme performance with filters and breakdowns. Always on.</small></span>
          <span className="pill pill-ok">Always on</span>
        </div>
        {MANAGEMENT_TAB_TOGGLES.map((t) => {
          const on = managementTabOn(settings, t.key);
          return (
            <label key={t.key} className="feature-row">
              <span className="fr-text"><b>{t.label}</b><small>{t.desc}</small></span>
              <span className={`pill ${on ? "pill-ok" : "pill-never"}`}>{on ? "On" : "Off"}</span>
              <input type="checkbox" className="switch" role="switch" aria-checked={on} checked={on} onChange={() => toggle(t.key)} aria-label={`Show the ${t.label} tab`} />
            </label>
          );
        })}
      </section>
    </div>
  );
}
