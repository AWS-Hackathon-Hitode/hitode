import { NextResponse } from "next/server";

const API_ENDPOINT = process.env.VIDEO_SEARCH_API_ENDPOINT!;

export async function POST(req: Request) {
  const body = await req.json();

  const res = await fetch(`${API_ENDPOINT}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data);
}
