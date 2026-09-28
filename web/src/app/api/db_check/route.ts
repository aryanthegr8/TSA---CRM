import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const [rows] = await db.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE()"
    );

    return NextResponse.json(rows);
  } catch {
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 503 }
    );
  }
}