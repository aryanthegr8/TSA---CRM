// Shared server-side expression: every view and action derives progress from saved records.
// Alias is a developer-owned SQL identifier, never user input.
export function parentStageSql(alias: "l" | "leads" = "l") {
 return `CASE
 WHEN ${alias}.status = 'admitted' THEN 'converted'
 WHEN ${alias}.status = 'lost' THEN 'closed'
 WHEN ${alias}.status = 'application_in_progress' OR EXISTS (SELECT 1 FROM referrals sr WHERE sr.lead_id=${alias}.id AND sr.status IN ('application_started','applied'))
   OR EXISTS (SELECT 1 FROM lead_activities sa JOIN referrals sr ON sr.id=sa.referral_id
    WHERE sa.lead_id=${alias}.id AND sa.outcome='parent_selected' AND sr.status NOT IN ('not_proceeding','admitted')
    AND NOT EXISTS (SELECT 1 FROM lead_activities reset_activity WHERE reset_activity.lead_id=${alias}.id AND reset_activity.outcome='Parent reconsidering school options'
      AND (reset_activity.occurred_at>sa.occurred_at OR (reset_activity.occurred_at=sa.occurred_at AND reset_activity.id>sa.id)))) THEN 'admission'
 WHEN EXISTS (SELECT 1 FROM school_visits sv JOIN referrals sr ON sr.id=sv.referral_id WHERE sv.lead_id=${alias}.id AND sv.status IN ('scheduled','completed') AND sr.status NOT IN ('not_proceeding','admitted')) THEN 'visits'
 WHEN EXISTS (SELECT 1 FROM referrals sr WHERE sr.lead_id=${alias}.id AND sr.status NOT IN ('shortlisted','not_proceeding')) THEN 'schools'
 ELSE 'requirements' END`;
}

export function preferredSchoolSql(alias: "l" | "r" = "l") {
 const leadId = alias === "l" ? "l.id" : "r.lead_id";
 return `(SELECT pa.referral_id FROM lead_activities pa WHERE pa.lead_id=${leadId} AND pa.outcome='parent_selected'
 AND NOT EXISTS(SELECT 1 FROM lead_activities ra WHERE ra.lead_id=pa.lead_id AND ra.outcome='Parent reconsidering school options'
 AND (ra.occurred_at>pa.occurred_at OR (ra.occurred_at=pa.occurred_at AND ra.id>pa.id)))
 ORDER BY pa.occurred_at DESC,pa.id DESC LIMIT 1)`;
}
