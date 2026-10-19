export const leadCategories = {
  general: "General enquiry",
  boarding_parent: "Parent — Boarding Admission",
  school_owner: "School Owner — Partnership",
} as const;

export type LeadCategory = keyof typeof leadCategories;

export const metaForms: Record<string, { category: LeadCategory; name: string; schoolType?: "day" | "boarding" }> = {
  "1512768827576448": { category: "boarding_parent", name: "Boarding parent 05/09/2026" },
  "998020903326884": { category: "school_owner", name: "SCHOOL ADMISSION CITY UPDATE-copy", schoolType: "day" },
  "1413460333859333": { category: "school_owner", name: "Residential school city update", schoolType: "boarding" },
};

export function metaFormId(input: unknown): string | null {
  return typeof input === "string" && /^\d{1,250}$/.test(input) ? input : null;
}

export function categoryLabel(category: string): string {
  return Object.hasOwn(leadCategories, category)
    ? leadCategories[category as LeadCategory]
    : leadCategories.general;
}
