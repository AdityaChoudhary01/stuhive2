
import { NextResponse } from "next/server";
import { getTopUniversities } from "@/actions/university.actions";


export async function GET() {
  try {
    const universities = await getTopUniversities();
    return NextResponse.json(universities);
  } catch (error) {
    console.error("Top universities API error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
