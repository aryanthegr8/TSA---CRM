export const referralTransitions: Record<string, string[]> = {
  shortlisted: ["shared_with_parent", "parent_interested", "sent_to_school", "not_proceeding"],
  shared_with_parent: ["parent_interested", "sent_to_school", "not_proceeding"],
  parent_interested: ["sent_to_school", "not_proceeding"],
  sent_to_school: ["school_responded", "visit_scheduled", "school_visited", "application_started", "applied", "admitted", "not_proceeding"],
  school_responded: ["visit_scheduled", "school_visited", "application_started", "applied", "admitted", "not_proceeding"],
  visit_scheduled: ["visit_scheduled", "school_visited", "application_started", "applied", "admitted", "not_proceeding"],
  school_visited: ["application_started", "applied", "admitted", "not_proceeding"],
  application_started: ["visit_scheduled", "school_visited", "applied", "admitted", "not_proceeding"],
  applied: ["visit_scheduled", "school_visited", "admitted", "not_proceeding"],
};
export function referralLabel(status: string): string {
  return status === "admitted" ? "Admission confirmed (converted)" : status.replaceAll("_", " ");
}
export const transferChannels = ["whatsapp", "email", "phone", "other"];
