import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/auth-rules";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { role: Role };
  }
}

// `next-auth/jwt` only re-exports from `@auth/core/jwt`, so the JWT interface
// has to be augmented where it is actually declared.
declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
  }
}
