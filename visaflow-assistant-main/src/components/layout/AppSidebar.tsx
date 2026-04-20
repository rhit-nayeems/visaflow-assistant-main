import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  FileText,
  Settings,
  LogOut,
  Plus,
  ChevronLeft,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const location = useLocation();
  const { user, isSchoolAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { to: "/dashboard" as const, icon: LayoutDashboard, label: "Dashboard" },
    { to: "/cases" as const, icon: FileText, label: "Cases" },
    ...(isSchoolAdmin
      ? [{ to: "/review/cases" as const, icon: ClipboardCheck, label: "Review Queue" }]
      : []),
    { to: "/settings" as const, icon: Settings, label: "Settings" },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar transition-all duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!collapsed && (
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md gradient-hero">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">VisaFlow</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      <div className="p-3">
        <Link to="/cases/new">
          <Button size={collapsed ? "icon" : "default"} className="w-full gap-2">
            <Plus className="h-4 w-4" />
            {!collapsed && "New Case"}
          </Button>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t p-3">
        <button
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent",
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Sign out"}
        </button>
        {!collapsed && user?.email && (
          <p className="truncate px-2.5 text-xs text-muted-foreground">{user.email}</p>
        )}
      </div>
    </aside>
  );
}
