import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  
  // In v5, req.auth is the SESSION object, not the raw token.
  // It looks like: { user: { id, role, email, ... }, expires }
  const session = req.auth; 
  const isLoggedIn = !!session;

  // 🚀 THE FIX: We must check session?.user?.role!
  if (pathname.startsWith("/admin") && session?.user?.role !== "admin") {
    return NextResponse.rewrite(new URL("/not-found", req.url));
  }
  
  // Safety check for public routes (Blogs)
  if (pathname.startsWith("/blogs/") && !["post", "my-blogs", "edit"].some(p => pathname.includes(p))) {
     return NextResponse.next();
  }

  // If unauthenticated user tries to access matcher routes, kick them to login
  if (!isLoggedIn) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: [
    "/notes/upload",
    "/feed",
    "/chat/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/collections/:path*",
    "/blogs/post",
    "/blogs/my-blogs",
    "/blogs/edit/:path*",
  ],
};