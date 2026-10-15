// Feature switches. Flip one here to change who sees what — no other code changes needed.
export const FEATURES = {
  // Coverage (visited within the visit target / overdue / never visited). Admins always see it in
  // the admin console's Network health tab; management always sees it on Management → Offices.
  // This switch adds it to management's Analytics visits map (the Coverage colouring) and to the
  // branch status shown in quick search.
  managementSeesNetworkCoverage: true,
};

// The Management section's tabs. Summary is always shown; an admin switches each of the others on
// individually (Admin console → Features). They are stored in settings.managementTabs and are off
// until switched on.
export const MANAGEMENT_TAB_TOGGLES = [
  { key: "offices", label: "Offices", desc: "Coverage map and visits per branch, VO, area and region office. Also enables Branch 360° and branch search." },
  { key: "people", label: "People", desc: "Staff directory and each person's full visit history. Also enables links to person profiles from the Summary." },
  { key: "analytics", label: "Analytics", desc: "In-depth visit and action item charts." },
];
export const managementTabOn = (settings, key) => key === "summary" || !!settings?.managementTabs?.[key];
