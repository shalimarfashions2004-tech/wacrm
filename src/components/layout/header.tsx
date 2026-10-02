"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  Bell,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Radio,
  Settings as SettingsIcon,
  User,
  Users,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

const pageTitles: Record<string, { key: string; source: "header" | "sidebar" }> = {
  "/dashboard": { key: "dashboard", source: "header" },
  "/inbox": { key: "inbox", source: "header" },
  "/notifications": { key: "notifications", source: "header" },
  "/contacts": { key: "contacts", source: "header" },
  "/pipelines": { key: "pipelines", source: "header" },
  "/broadcasts": { key: "broadcasts", source: "header" },
  "/automations": { key: "automations", source: "header" },
  "/settings": { key: "settings", source: "header" },
  "/flows": { key: "flows", source: "sidebar" },
  "/agents": { key: "aiAgents", source: "sidebar" },
};

const primaryNav = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", key: "inbox", icon: MessageSquare },
  { href: "/contacts", key: "contacts", icon: Users },
  { href: "/pipelines", key: "pipelines", icon: GitBranch },
  { href: "/broadcasts", key: "broadcasts", icon: Radio },
] as const;

function getPageTitleMeta(pathname: string) {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path),
  );
  return match ? match[1] : pageTitles["/dashboard"];
}

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

import { useTranslations } from "next-intl";

export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const tSidebar = useTranslations("Sidebar");
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const titleMeta = getPageTitleMeta(pathname);
  const pageTitle = titleMeta.source === "sidebar" ? tSidebar(titleMeta.key) : t(titleMeta.key);
  const unreadNotifications = useUnreadNotifications();

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  return (
    <header className="glass-header sticky top-0 z-20 shrink-0 border-b border-border px-4 lg:px-7">
      <div className="flex h-16 min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger — mobile only. 44×44 hit target per Apple HIG. */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t("openMenu")}
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <nav aria-label={tSidebar("primaryNav")} className="hidden min-w-0 items-center gap-1 overflow-x-auto md:flex">
          {primaryNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-card-2 hover:text-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <h1 className="truncate text-base font-semibold text-foreground md:hidden sm:text-lg">
          {pageTitle}
        </h1>
        </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Link
          href="/notifications"
          aria-label={t("notifications")}
          title={t("notifications")}
          className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card-2 hover:text-foreground"
        >
          <Bell className="size-4" />
          {unreadNotifications > 0 ? (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-background" aria-hidden="true" />
          ) : null}
        </Link>
        <ModeToggle />

        <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/70 focus:bg-muted/70 focus:outline-none data-popup-open:bg-muted/70 sm:gap-3 sm:pl-1 sm:pr-3"
          aria-label={t("openAccountMenu")}
        >
          <Avatar className="size-8">
            {profile?.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt={profile.full_name ?? t("defaultAvatar")}
              />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium text-foreground sm:inline">
            {profile?.full_name ?? t("defaultUser")}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="min-w-56 bg-popover text-popover-foreground ring-border"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {profile?.full_name ?? t("defaultUser")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.email ?? ""}
            </p>
          </div>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            render={
              <Link
                href="/settings?tab=profile"
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              />
            }
          >
            <User className="size-4" />
            {t("menuProfile")}
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link
                href="/settings?tab=whatsapp"
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              />
            }
          >
            <SettingsIcon className="size-4" />
            {t("menuSettings")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={signOut}
            className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
          >
            <LogOut className="size-4" />
            {t("menuSignOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
      <div className="flex min-h-[76px] items-center justify-between gap-4 border-t border-border/60 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("workspace")} / {pageTitle}</p>
          <h2 className="truncate text-2xl font-light tracking-[-0.03em] text-foreground sm:text-[28px]">{pageTitle}</h2>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Link href="/settings" className="inline-flex items-center gap-2 rounded-full bg-card-2 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary-soft">
            <SettingsIcon className="size-4" />
            {t("settings")}
          </Link>
        </div>
      </div>
    </header>
  );
}
