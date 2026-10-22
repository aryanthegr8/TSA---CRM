// Catalog eligibility is explicitly verified by managers rather than guessed from city names.
export const dayParentSchoolSql = "ps.is_active=1 AND ps.school_type IN ('day','both') AND ps.day_parent_delhi_ncr=1";
export function visibleDayParentSchools<T extends {id:number;school_type?:string;day_parent_delhi_ncr?:number;is_active?:number}>(schools:T[],category:string):T[]{
 return category==='day_parent'?schools.filter(s=>Boolean(s.is_active)&&['day','both'].includes(s.school_type??'')&&Number(s.day_parent_delhi_ncr)===1):schools;
}
