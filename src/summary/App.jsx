import React, { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { useTheme } from "../lib/theme";
import { expandVisits } from "../lib/visits";
import { computeCoverage, DEFAULT_SETTINGS } from "../lib/offices";
import Summary from "../staff/management/Summary";

/* The public summary (/summary.html): the Management Summary for the last 30 days, for anyone
   with the link. No sign-in, no filters, no links into the app, and no one's name or contact
   details. It reads the same API the apps do; only aggregate numbers are shown. */

const get = (name) => fetch(`/api/${name}`).then((r) => { if (!r.ok) throw new Error(name); return r.json(); });

export default function App() {
  useTheme(); // follows the theme this browser last used in the app
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all(["visits", "offices", "employees", "settings"].map(get))
      .then(([visits, offices, employees, settings]) => setData({
        visits, offices,
        // only what the counts need: never keep anyone's details in the page
        employees: employees.map((e) => ({ id: e.id, roles: e.roles || [] })),
        settings: settings && !Array.isArray(settings) ? settings : DEFAULT_SETTINGS,
        at: new Date(),
      }))
      .catch(() => setError(true));
  }, []);

  const records = useMemo(() => (data ? expandVisits(data.visits) : []), [data]);
  const coverage = useMemo(
    () => (data ? computeCoverage(data.offices, records, data.settings.visitTargetDays || 90) : []),
    [data, records]
  );

  return (
    <div className="fvt">
      <main className="public-main">
        <div className="page">
          <div className="page-head">
            <div>
              <p className="h-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="brand-mark sm"><MapPin size={13} /></span> BRAC · Field Visit Tracker
              </p>
              <h1 className="h-title">Field visits at a glance</h1>
              <p className="h-desc">
                {data ? `As of ${data.at.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}. ` : ""}
                Activity, coverage, information quality and action item handling. A read-only snapshot.
              </p>
            </div>
          </div>
          {error ? <div className="card card-pad empty-note">The summary couldn't be loaded. Try again in a moment.</div>
            : !data ? <div className="card card-pad empty-note">Loading…</div>
            : <Summary trips={data.visits} records={records} coverage={coverage} offices={data.offices} employees={data.employees} settings={data.settings} period="30d" publicView />}
        </div>
      </main>
    </div>
  );
}
