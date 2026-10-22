export const leadCategories = {
  general: "General enquiry",
  day_parent: "Parent — Day School (Delhi NCR)",
  boarding_parent: "Parent — Boarding Admission",
  school_owner: "School Owner — Partnership",
} as const;

export type LeadCategory = keyof typeof leadCategories;

export const metaForms: Record<string, { category: LeadCategory; name: string; schoolType?: "day" | "boarding" }> = {
  "1512768827576448": { category: "boarding_parent", name: "Boarding parent 05/09/2026", schoolType: "boarding" },
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

// Read at request time, so setting the new form IDs only requires a service restart.
// Form IDs are public identifiers; never put page access tokens in this setting.
export function configuredDayParentFormIds(value=process.env.META_DAY_PARENT_FORM_IDS??'') {
 const ids=[...new Set(value.split(/[\s,]+/).filter(Boolean))];
 if(ids.some(id=>!metaFormId(id)))throw new Error('META_DAY_PARENT_FORM_IDS must contain numeric Instant Form IDs separated by commas.');
 if(ids.some(id=>Object.hasOwn(metaForms,id)))throw new Error('A day-parent form ID conflicts with an existing boarding-parent or school-owner form. Use a separate Instant Form.');
 return ids;
}
export function resolveMetaForm(formId:string|null){
 if(!formId)return undefined;
 const known=metaForms[formId];if(known)return known;
 return configuredDayParentFormIds().includes(formId)?{category:'day_parent' as const,name:'Day-school parents — Delhi NCR',schoolType:'day' as const}:undefined;
}
export function leadInboxPath(category:string){
 return category==='day_parent'?'/leads/day-parents':category==='boarding_parent'?'/leads/boarding-parents':category==='school_owner'?'/leads/school-owners':'/leads';
}
