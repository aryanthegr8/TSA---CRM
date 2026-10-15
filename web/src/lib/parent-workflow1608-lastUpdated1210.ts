export const parentOutcomes = {
  follow_up: {
    school_contacted: "School contacted the parent", documents: "Documents pending", payment: "Fee / payment pending", reconsidering: "Parent reconsidering school options", discussing: "Requirements discussed", transferred: "Transferred to schools", comparing: "Comparing schools",
    budget: "Budget concern", location: "Location does not suit", callback: "Requested callback",
    next_session: "Admission for next session", considering: "Needs time / family discussion",
    visit_scheduled: "School visit scheduled", visit_completed: "School visit completed",
    visit_rescheduled: "School visit rescheduled", visit_cancelled: "School visit cancelled",
    visit_no_show: "Parent did not attend visit", proceed: "Proceeding with selected school", application: "Application in progress",
  },
  unanswered: { no_answer: "No answer", busy: "Busy", unreachable: "Switched off / unreachable" },
  dead: { not_looking: "Not looking for admission", elsewhere: "Admission taken elsewhere", invalid: "Invalid number", wrong: "Wrong enquiry", declined: "Explicitly declined" },
  converted: { confirmed: "Admission confirmed" },
} as const;
export const parentHeadings = { follow_up: "Follow-up", unanswered: "Didn’t answer", dead: "Dead lead", converted: "Converted" };
export const schoolRequired = ["school_contacted", "transferred", "comparing", "proceed", "application", "documents", "payment", "confirmed", "visit_scheduled", "visit_completed", "visit_rescheduled", "visit_cancelled", "visit_no_show"];
export const singleSchool = schoolRequired.filter(outcome => !["school_contacted", "transferred", "comparing"].includes(outcome));

export type ParentStage = "requirements" | "schools" | "visits" | "admission" | "converted" | "closed";
export const parentStageLabels: Record<ParentStage,string> = {
 requirements: "1 · Understand requirements", schools: "2 · School follow-up", visits: "3 · Visit follow-up",
 admission: "4 · Admission follow-up", converted: "5 · Converted", closed: "Closed",
};
const stageOptions: Record<ParentStage,string[]> = {
 requirements: ["discussing","transferred","callback","next_session","budget","considering"],
 schools: ["school_contacted","comparing","budget","location","transferred","proceed","visit_scheduled","callback","next_session","considering","discussing"],
 visits: ["visit_completed","visit_rescheduled","visit_cancelled","visit_no_show","visit_scheduled","proceed","comparing","budget","callback","considering"],
 admission: ["application","documents","payment","reconsidering","visit_scheduled","visit_completed","visit_rescheduled","visit_cancelled","visit_no_show","callback","budget","considering"],
 converted: [], closed: [],
};
export function stageOutcomeAllowed(stage: ParentStage, heading: string, outcome: string) {
 if (!Object.hasOwn(stageOptions,stage) || ["converted","closed"].includes(stage)) return false;
 if (heading === "converted") return stage === "admission" && outcome === "confirmed";
 if (heading === "follow_up") return stageOptions[stage].includes(outcome);
 return (heading === "dead" || heading === "unanswered") && Object.hasOwn(parentOutcomes[heading],outcome);
}
export function optionsForStage(stage: ParentStage, heading: keyof typeof parentHeadings): Record<string,string> {
 return Object.fromEntries(Object.entries(parentOutcomes[heading]).filter(([outcome])=>stageOutcomeAllowed(stage,heading,outcome)));
}
export const stageNextActions: Record<ParentStage,string> = {
 requirements: "Call parent to confirm admission requirements",
 schools: "Call parent to discuss the shared schools",
 visits: "Confirm the visit and record the parent’s feedback",
 admission: "Follow up on application, documents and admission",
 converted: "Admission confirmed — no further callbacks",
 closed: "Lead closed — no further callbacks",
};
