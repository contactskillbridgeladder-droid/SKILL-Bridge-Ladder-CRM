import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: Request) {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // We can also allow the client to specify a folder, but we will lock it to 'skillbridge_crm' for now
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder: "skillbridge_crm" },
      process.env.CLOUDINARY_API_SECRET!
    );

    return NextResponse.json({ timestamp, signature, folder: "skillbridge_crm" });
  } catch (error: any) {
    console.error("Cloudinary Signature Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
