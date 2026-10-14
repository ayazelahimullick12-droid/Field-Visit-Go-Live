// Feature switches. Flip one here to change who sees what — no other code changes needed.
export const FEATURES = {
  // Coverage (visited within the visit target / overdue / never visited). Admins always see it in
  // the admin console's Network health tab; management always sees it on Management → Offices.
  // This switch adds it to management's Analytics visits map (the Coverage colouring) and to the
  // branch status shown in quick search.
  managementSeesNetworkCoverage: true,
};
