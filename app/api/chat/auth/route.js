export const runtime = "edge";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Rest } from "ably"; // 🚀 Ably supports Edge natively!


export async function GET(req) {
  try {
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initialize Ably client
    const client = new Rest(process.env.ABLY_API_KEY);

    // The SDK automatically uses WebCrypto in Edge to sign the request
    const tokenRequestData = await client.auth.createTokenRequest({
      clientId: String(session.user.id),
    });

    return NextResponse.json(tokenRequestData);
  } catch (error) {
    console.error("Ably Auth Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}