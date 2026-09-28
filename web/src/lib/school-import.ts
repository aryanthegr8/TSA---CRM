import "server-only";
import ExcelJS from "exceljs";

export type ImportSchool = {
  row: number; name: string; schoolType: "day" | "boarding" | "both";
  city: string | null; state: string | null; board: string | null;
  classesOffered: string | null; feeNote: string | null; internalNotes: string | null;
  contactName: string | null; contactPhone: string | null; contactEmail: string | null;
};
export type ImportIssue = { row: number; message: string };
export type ParsedSchools = { rows: ImportSchool[]; issues: ImportIssue[]; total: number };

const headers: Record<string, keyof Omit<ImportSchool, "row" | "schoolType"> | "schoolType"> = {
  name: "name", school_name: "name", school: "name", school_type: "schoolType", type: "schoolType",
  city: "city", state: "state", board: "board", classes_offered: "classesOffered", classes: "classesOffered",
  fee_note: "feeNote", fees: "feeNote", internal_notes: "internalNotes", notes: "internalNotes",
  contact_name: "contactName", contact_phone: "contactPhone", contact_email: "contactEmail",
};
const maxLengths: Record<string, number> = {
  name: 255, city: 120, state: 120, board: 120, classesOffered: 255,
  feeNote: 255, internalNotes: 5000, contactName: 160, contactPhone: 20, contactEmail: 255,
};
const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) throw new Error("Formula cells are not supported");
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value) return String(value.text).trim();
    throw new Error("Unsupported cell type");
  }
  return String(value).trim();
};
const normalizedKey = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");
export const schoolKey = (name: string, city: string | null, state: string | null) =>
  [name, city || "", state || ""].map((value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN")).join("|");

export async function parseSchoolWorkbook(buffer: Buffer): Promise<ParsedSchools> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no worksheet.");
  if (sheet.rowCount > 2001) throw new Error("The file exceeds the 2,000 school row limit.");
  const first = sheet.getRow(1);
  const columns = new Map<keyof ImportSchool, number>();
  for (let col = 1; col <= first.cellCount; col++) {
    const label = normalizedKey(cellText(first.getCell(col)));
    if (!label) continue;
    const mapped = headers[label];
    if (!mapped) continue;
    if (columns.has(mapped)) throw new Error(`The ${label} column appears more than once.`);
    columns.set(mapped, col);
  }
  if (!columns.has("name") || !columns.has("schoolType")) {
    throw new Error("The first row needs School Name and School Type columns.");
  }
  const rows: ImportSchool[] = [];
  const issues: ImportIssue[] = [];
  let total = 0;
  for (let number = 2; number <= sheet.rowCount; number++) {
    const row = sheet.getRow(number);
    const data: Record<string, string> = {};
    try {
      for (const [key, col] of columns) data[key] = cellText(row.getCell(col));
    } catch (error) {
      issues.push({ row: number, message: error instanceof Error ? error.message : "Invalid cell" });
      total++;
      continue;
    }
    if (Object.values(data).every((value) => !value)) continue;
    total++;
    const typeText = (data.schoolType || "").trim().toLowerCase().replace(/\s+/g, " ");
    const schoolType = typeText === "day" || typeText === "day school" || typeText === "day schools" ? "day"
      : typeText === "boarding" || typeText === "boarding school" || typeText === "residential" || typeText === "residential school" ? "boarding"
      : typeText === "both" ? "both" : null;
    const error = !data.name ? "School Name is required"
      : !schoolType ? "School Type must be Day, Boarding, Residential, or Both"
      : Object.entries(maxLengths).find(([key, length]) => (data[key] || "").length > length)?.[0]
        ? "One or more cells exceed the permitted length"
      : (data.contactPhone && !/^\+[1-9]\d{7,14}$/.test(data.contactPhone.replace(/[\s()-]/g, "")))
        ? "Contact phone needs a country code such as +91"
      : (data.contactEmail && !/^\S+@\S+\.\S+$/.test(data.contactEmail))
        ? "Contact email is invalid"
      : ((data.contactPhone || data.contactEmail) && !data.contactName)
        ? "Contact name is required when contact details are provided" : null;
    if (error) { issues.push({ row: number, message: error }); continue; }
    const optional = (key: string) => data[key]?.trim() || null;
    rows.push({ row: number, name: data.name.trim(), schoolType: schoolType!,
      city: optional("city"), state: optional("state"), board: optional("board"),
      classesOffered: optional("classesOffered"), feeNote: optional("feeNote"),
      internalNotes: optional("internalNotes"), contactName: optional("contactName"),
      contactPhone: data.contactPhone ? data.contactPhone.replace(/[\s()-]/g, "") : null,
      contactEmail: optional("contactEmail") });
  }
  if (!total) throw new Error("The worksheet has no school rows.");
  return { rows, issues, total };
}
