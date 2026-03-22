import type { Metadata } from "next";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import "./globals.css";

export const metadata: Metadata = {
  title: "myFuckingMusic — Admin Portal",
  description: "Manage features, users, and subscriptions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthGuard>
          <div className="min-h-screen flex">
            <Sidebar />
            <main className="flex-1 p-8">{children}</main>
          </div>
        </AuthGuard>
      </body>
    </html>
  );
}

function Sidebar() {
  return (
    <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-6 flex flex-col gap-2">
      <h1 className="text-lg font-bold text-white mb-6">myFuckingMusic</h1>
      <NavLink href="/">Dashboard</NavLink>
      <NavLink href="/users">Users</NavLink>
      <NavLink href="/invitations">Invitations</NavLink>
      <NavLink href="/features">Feature Matrix</NavLink>
      <NavLink href="/plans">Plans & Pricing</NavLink>
      <NavLink href="/subscriptions">Subscriptions</NavLink>
      <NavLink href="/curation">Song Curation</NavLink>
      <NavLink href="/charts">Chart Alerts</NavLink>
    </aside>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
    >
      {children}
    </Link>
  );
}
