import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { Lock, Loader2 } from "lucide-react";
import {
  BarChart3,
  Bell,
  GitCompareArrows,
  LayoutGrid,
  LineChart,
  LogOut,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Store,
  Radar,
  Megaphone,
  Wallet,
  Calculator,
  ShoppingBag,
  Package,
  Undo2,
  Award,
  FolderKanban,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

type MenuItem = { icon: typeof LayoutGrid; label: string; path: string; comingSoon?: boolean };
type MenuGroup = { title: string | null; items: MenuItem[] };

const menuGroups: MenuGroup[] = [
  {
    title: "Disponível",
    items: [
      { icon: LayoutGrid, label: "Painel", path: "/" },
      { icon: ShoppingBag, label: "Vendas", path: "/vendas" },
      { icon: Package, label: "Meus anúncios", path: "/anuncios" },
      { icon: Megaphone, label: "ADS", path: "/ads" },
      { icon: Wallet, label: "Lucratividade", path: "/lucratividade" },
      { icon: Calculator, label: "Calculadora de precificação", path: "/calculadora" },
      { icon: FolderKanban, label: "Projeto", path: "/projeto" },
    ],
  },
  {
    title: "Em construção",
    items: [
      { icon: Undo2, label: "Pós-venda", path: "/pos-venda", comingSoon: true },
      { icon: Award, label: "Reputação", path: "/reputacao", comingSoon: true },
      { icon: Radar, label: "Radar de concorrentes", path: "/radar", comingSoon: true },
      { icon: TrendingUp, label: "Mais vendidos", path: "/mais-vendidos", comingSoon: true },
      { icon: Search, label: "Buscar produtos", path: "/buscar", comingSoon: true },
      { icon: Sparkles, label: "Oportunidades", path: "/oportunidades", comingSoon: true },
      { icon: GitCompareArrows, label: "Comparar", path: "/comparar", comingSoon: true },
      { icon: BarChart3, label: "Categorias", path: "/categorias", comingSoon: true },
      { icon: LineChart, label: "Monitoramento", path: "/monitoramento", comingSoon: true },
      { icon: Bell, label: "Alertas", path: "/alertas", comingSoon: true },
    ],
  },
  {
    title: null,
    items: [
      { icon: Settings, label: "Configurações", path: "/configuracoes" },
    ],
  },
];

const menuItems: MenuItem[] = menuGroups.flatMap((g) => g.items);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 268;
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-md">
        <TrendingUp className="h-4.5 w-4.5" strokeWidth={2.6} />
      </div>
      <div className="flex flex-col min-w-0 leading-none">
        <span className="font-display text-lg font-bold tracking-tight truncate">
          Mercato
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
          Market Intelligence
        </span>
      </div>
    </div>
  );
}

function AccessGate() {
  const { data: gate, isLoading } = trpc.auth.gateInfo.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [password, setPassword] = useState("");
  const login = trpc.auth.passwordLogin.useMutation({
    onSuccess: () => {
      // The session cookie is now set. A full reload re-fetches auth.me with
      // the cookie present and lands on the dashboard. We intentionally do NOT
      // await a refetch first: if that refetch transiently failed it could
      // swallow the navigation and trap the user on the password screen.
      window.location.replace("/");
    },
    onError: (err) => {
      toast.error(err.message || "Não foi possível entrar.");
      setPassword("");
    },
  });

  const passwordGate = gate?.passwordGateEnabled ?? false;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || login.isPending) return;
    login.mutate({ password });
  }

  return (
    <div className="canvas-wash flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full animate-rise">
        <Wordmark />
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-3xl font-display font-bold tracking-tight text-center">
            Central de gestão da sua loja no{" "}
            <span className="brand-text-gradient">Mercado Livre</span>
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
            Acompanhe vendas, desempenho dos seus anúncios, lucratividade e
            reputação — com dados reais da loja, em um só lugar.
          </p>
        </div>

        {isLoading ? (
          <div className="flex h-12 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : passwordGate ? (
          <form onSubmit={submit} className="w-full flex flex-col gap-3">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a senha de acesso"
                className="h-12 pl-10 text-base"
                disabled={login.isPending}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full shadow-lg hover:shadow-xl transition-all"
              disabled={login.isPending || !password.trim()}
            >
              {login.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </Button>
            <button
              type="button"
              onClick={() => {
                window.location.href = getLoginUrl();
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
            >
              Entrar como administrador (Mercado Livre)
            </button>
          </form>
        ) : (
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Entrar para começar
          </Button>
        )}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return <AccessGate />;
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const activeMenuItem = menuItems.find((item) => item.path === location);
  const isMobile = useIsMobile();

  // Always scroll back to the top of the page whenever the route changes, so
  // navigating between menu items never lands the user halfway down a page.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  const { data: alerts } = trpc.monitor.alerts.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const unread = (alerts ?? []).filter((a) => !a.isRead).length;

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r" disableTransition={isResizing}>
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div className="flex items-center px-1.5 w-full">
              {!isCollapsed ? (
                <Wordmark />
              ) : (
                <div className="flex h-8 w-8 mx-auto items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <TrendingUp className="h-4 w-4" strokeWidth={2.5} />
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-3 gap-0.5">
              {menuGroups.map((group, gi) => (
                <div key={gi} className="mb-1">
                  {group.title && !isCollapsed && (
                    <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                      {group.title}
                    </p>
                  )}
                  {group.items.map((item) => {
                    const isActive =
                      location === item.path ||
                      (item.path === "/calculadora" && location.startsWith("/calculadora")) ||
                      (item.path === "/projeto" && location.startsWith("/projeto"));
                    const showBadge = item.path === "/alertas" && unread > 0;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.comingSoon ? `${item.label} — em breve` : item.label}
                          className={`relative h-9.5 transition-all data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground ${item.comingSoon && !isActive ? "text-muted-foreground/70" : ""}`}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary group-data-[collapsible=icon]:hidden" aria-hidden />
                          )}
                          <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : item.comingSoon ? "opacity-70" : ""}`} />
                          <span>{item.label}</span>
                          {item.comingSoon && (
                            <span className="ml-auto rounded-full border border-amber-300/60 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 group-data-[collapsible=icon]:hidden">
                              Em breve
                            </span>
                          )}
                          {showBadge && !item.comingSoon && (
                            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                              {unread}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </div>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent/60 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/15 text-primary">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">{user?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">{user?.email || "-"}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={() => setLocation("/configuracoes")}
                  className="cursor-pointer"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Configurações</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <span className="font-display tracking-tight text-foreground">
                {activeMenuItem?.label ?? "Mercato"}
              </span>
            </div>
          </div>
        )}
        <main ref={mainRef} className="flex-1">{children}</main>
      </SidebarInset>
    </>
  );
}
