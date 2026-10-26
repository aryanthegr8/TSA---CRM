export const departments = {
  school_partnerships: "School Partnerships",
  parent_admissions: "Parent Admissions",
} as const;

export type CrmDepartment = keyof typeof departments;

export function isCrmDepartment(value: unknown): value is CrmDepartment {
  return value === "school_partnerships" || value === "parent_admissions";
}

export function leadDepartment(category: string): CrmDepartment | null {
  if (category === "school_owner") return "school_partnerships";
  if (category === "day_parent" || category === "boarding_parent") return "parent_admissions";
  return null; // general enquiries remain admin/manager-managed
}

export function canOwnCategory(role: string, department: CrmDepartment | null, category: string): boolean {
  if (role === "admin" || role === "manager") return true;
  return role === "counsellor" && department !== null && leadDepartment(category) === department;
}
