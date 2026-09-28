import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

interface LoginUser extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password_hash: string | null;
  is_active: number;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  providers: [Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      if (!email || !password) return null;
      const [rows] = await db.execute<LoginUser[]>(
        "SELECT id, name, email, password_hash, is_active FROM crm_users WHERE email = ? LIMIT 1", [email]
      );
      const user = rows[0];
      if (!user || !user.is_active || !user.password_hash) return null;
      if (!(await bcrypt.compare(password, user.password_hash))) return null;
      return { id: String(user.id), name: user.name, email: user.email };
    },
  })],
});
