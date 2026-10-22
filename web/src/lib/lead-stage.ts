// Shared server-side expression: every view and action derives progress from saved records.
// Alias is a developer-owned SQL identifier, never user input.
export function parentStageSql(alias: "l" | "leads" = "l") {
 return `CASE
 WHEN ${alias}.status = 'admitted' THEN 'converted'
 WHEN ${alias}.status = 'lost' THEN 'closed'
 WHEN EXISTS(SELECT 1 FROM boarding_school_requests br JOIN boarding_school_targets bt ON bt.id=br.target_id
 LEFT JOIN school_partnerships sp ON sp.lead_id=bt.school_owner_lead_id LEFT JOIN partner_schools ps ON ps.id=sp.partner_school_id
 WHERE br.lead_id=${alias}.id AND br.exclusive_only=1 AND COALESCE((sp.stage='confirmed' AND sp.verified_at IS NOT NULL AND ps.is_active=1 AND ps.school_type IN ('boarding','both')),0)=0) THEN 'awaiting_requested'
 WHEN ${alias}.status = 'application_in_progress' OR EXISTS (SELECT 1 FROM referrals sr WHERE sr.lead_id=${alias}.id AND sr.status IN ('application_started','applied'))
   OR EXISTS (SELECT 1 FROM lead_activities sa JOIN referrals sr ON sr.id=sa.referral_id
    WHERE sa.lead_id=${alias}.id AND sa.outcome='parent_selected' AND sr.status NOT IN ('not_proceeding','admitted')
    AND NOT EXISTS (SELECT 1 FROM lead_activities reset_activity WHERE reset_activity.lead_id=${alias}.id AND reset_activity.outcome='Parent reconsidering school options'
      AND (reset_activity.occurred_at>sa.occurred_at OR (reset_activity.occurred_at=sa.occurred_at AND reset_activity.id>sa.id)))) THEN 'admission'
 WHEN EXISTS (SELECT 1 FROM school_visits sv JOIN referrals sr ON sr.id=sv.referral_id WHERE sv.lead_id=${alias}.id AND sv.status IN ('scheduled','completed') AND sr.status NOT IN ('not_proceeding','admitted')) THEN 'visits'
 WHEN EXISTS (SELECT 1 FROM referrals sr WHERE sr.lead_id=${alias}.id AND sr.status NOT IN ('not_proceeding','admitted') AND (sr.school_contact_outcome='parent_contacted' OR sr.parent_decision NOT IN ('awaiting_discussion','not_interested'))) THEN 'decision'
 WHEN EXISTS (SELECT 1 FROM referrals sr WHERE sr.lead_id=${alias}.id AND sr.status <> 'not_proceeding' AND (sr.call_requested_at IS NOT NULL OR sr.status <> 'shortlisted')) THEN 'schools'
 WHEN ${alias}.status='qualified' OR EXISTS(SELECT 1 FROM boarding_school_requests br WHERE br.lead_id=${alias}.id) THEN 'qualified'
 ELSE 'requirements' END`;
}

export function preferredSchoolSql(alias: "l" | "r" = "l") {
 const leadId = alias === "l" ? "l.id" : "r.lead_id";
 return `(SELECT pa.referral_id FROM lead_activities pa WHERE pa.lead_id=${leadId} AND pa.outcome='parent_selected'
 AND NOT EXISTS(SELECT 1 FROM lead_activities ra WHERE ra.lead_id=pa.lead_id AND ra.outcome='Parent reconsidering school options'
 AND (ra.occurred_at>pa.occurred_at OR (ra.occurred_at=pa.occurred_at AND ra.id>pa.id)))
 ORDER BY pa.occurred_at DESC,pa.id DESC LIMIT 1)`;
}
