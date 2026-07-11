"use client";

import {
  requestTypes,
  userRoles,
  userStatuses,
  type AccessRequest,
  type AuditEvent,
  type IssuedCredential,
  type ManagedUser,
  type PortalUser,
  type RequestType,
  type UserRole,
  type UserStatus,
  type SystemSummary,
  type VaultPluginApplyResult,
  type VaultPluginGenerateResult,
  type VaultPluginTemplate,
  type VaultPluginType,
  type VaultMappingHealth
} from "@security-portal/shared";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleGauge,
  ClipboardCheck,
  Database,
  HeartPulse,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  PlugZap,
  ScrollText,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  Users,
  Wrench,
  X,
  type LucideIcon
} from "lucide-react";

type View =
  | "dashboard"
  | "secrets"
  | "systems"
  | "requests"
  | "approvals"
  | "credentials"
  | "audit"
  | "health"
  | "plugins"
  | "users"
  | "admin";
type Language = "en" | "ko";
type Theme = "light" | "dark";
type DashboardStats = {
  systems: number;
  secretSurfaces: number;
  pending: number;
  active: number;
  failures: number;
  expiringSoon: number;
};
type VaultHealthResponse = {
  mode: "mock" | "real";
  healthy: boolean;
  detail: Record<string, unknown>;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

const navItems: Array<{ view: View; href: string; icon: LucideIcon; roles?: UserRole[] }> = [
  { view: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { view: "secrets", href: "/secrets", icon: Database },
  { view: "systems", href: "/systems", icon: Boxes },
  { view: "requests", href: "/requests", icon: ClipboardCheck, roles: ["developer", "app-owner", "vault-admin"] },
  { view: "approvals", href: "/approvals", icon: ShieldCheck, roles: ["security-approver", "vault-admin"] },
  { view: "credentials", href: "/credentials", icon: KeyRound, roles: ["developer", "app-owner", "vault-admin"] },
  { view: "audit", href: "/audit", icon: ScrollText, roles: ["auditor", "vault-admin"] },
  { view: "health", href: "/health", icon: HeartPulse, roles: ["auditor", "vault-admin"] },
  { view: "plugins", href: "/plugins", icon: PlugZap },
  { view: "users", href: "/users", icon: Users, roles: ["vault-admin"] },
  { view: "admin", href: "/admin", icon: Wrench, roles: ["vault-admin"] }
];

function canUseNavItem(roles: UserRole[], item: (typeof navItems)[number]): boolean {
  return !item.roles || item.roles.some((role) => roles.includes(role));
}

const copy = {
  en: {
    brandTitle: "Security Portal",
    brandSubtitle: "Vault-backed self-service",
    topbarSubtitle: "Business workflow first. Vault paths and leases stay in advanced details.",
    languageLabel: "Language",
    loading: "Loading portal data...",
    nav: {
      dashboard: "Dashboard",
      secrets: "Secret Inventory",
      systems: "My Systems",
      requests: "Secret Request",
      approvals: "Approval Inbox",
      credentials: "Active Credentials",
      audit: "Audit Reports",
      health: "Platform Health",
      plugins: "Vault Plugin Factory",
      users: "User Management",
      admin: "Admin"
    },
    login: {
      eyebrow: "Vault-based workflow portal",
      title: "Security Self-Service Portal",
      description:
        "Local and test deployments start with mock login and mock Vault. Real Vault and Keycloak are enabled behind adapters in later phases."
    },
    dashboard: {
      title: "Security operations overview",
      description:
        "Short-lived credential activity, approval backlog, and Vault-backed secret surfaces across assigned systems.",
      modeLabel: "Current mode",
      modeValue: "Mock Vault",
      metrics: {
        systems: "My systems",
        mapped: "mapped secret surfaces",
        pending: "Pending approvals",
        waiting: "waiting for review",
        active: "Active credentials",
        expiring: "expire within 24h",
        failures: "Revocation failures",
        operator: "requires operator action"
      },
      posture: "Credential posture",
      activeIssued: "Active issued secrets",
      mappedRoles: "Mapped Vault roles",
      pendingApprovals: "Pending approvals",
      latest: "Latest issued secret",
      noIssued: "No issued credential yet.",
      recentIssuance: "Recent issuance history",
      recentWorkflow: "Recent workflow events",
      pendingQueue: "Pending request queue",
      distribution: "Secret type distribution",
      lifecycle: "Lifecycle posture",
      inventory: "Issued secret inventory",
      surfaces: "Vault-backed secret surfaces"
    },
    secrets: {
      title: "Vault dependency map",
      description: "Click the dependency map to inspect systems, namespaces, mounts, roles, policies, and issued Vault leases.",
      issued: "Issued",
      active: "Active",
      mapped: "Mapped",
      distribution: "Secret type distribution",
      lifecycle: "Lifecycle posture",
      pending: "Pending",
      revoked: "Revoked",
      failed: "Failed",
      noIssued: "No issued secrets yet.",
      inventory: "Issued secret inventory",
      surfaces: "Vault-backed secret surfaces",
      nodes: "Nodes",
      edges: "Edges",
      leases: "Leases",
      namespaces: "Namespaces",
      mounts: "Mounts",
      systems: "Systems",
      vaultCore: "Vault core",
      topology: "Dependency map",
      namespacePlane: "Namespace plane",
      leaseOrbit: "Lease orbit",
      pathFocus: "Primary dependency paths"
    },
    systems: {
      empty: "No systems assigned.",
      owner: "Owner group",
      allowed: "Allowed requests",
      advanced: "Advanced Vault details"
    },
    request: {
      title: "Request Wizard",
      targetSystem: "Target system",
      requestType: "Request type",
      reason: "Business reason",
      submit: "Submit request",
      defaultReason: "Temporary access for release validation"
    },
    approvals: {
      empty: "No requests yet.",
      advanced: "Advanced Vault details",
      approve: "Approve",
      reject: "Reject",
      execute: "Execute"
    },
    credentials: {
      empty: "No issued credentials.",
      expires: "expires",
      advanced: "Advanced Vault details",
      revoke: "Revoke"
    },
    audit: {
      title: "Business workflow audit"
    },
    admin: {
      health: "Vault integration health",
      catalog: "Plugin catalog",
      mappings: "System-to-Vault mappings",
      inspection: "Vault mapping inspection",
      yes: "yes",
      no: "no",
      unknown: "unknown"
    },
    table: {
      noData: "No data.",
      system: "System",
      type: "Type",
      status: "Status",
      ttl: "TTL",
      action: "Action",
      actor: "Actor",
      target: "Target",
      result: "Result",
      requester: "Requester",
      risk: "Risk",
      secretType: "Secret type",
      maskedValue: "Masked value",
      expires: "Expires",
      lease: "Lease",
      env: "Env",
      namespace: "Namespace",
      mount: "Mount",
      role: "Role",
      requestType: "Request type",
      time: "Time",
      mode: "Mode",
      healthy: "Healthy",
      version: "Version",
      cluster: "Cluster",
      plugin: "Plugin",
      reachable: "Reachable"
    }
  },
  ko: {
    brandTitle: "보안 포털",
    brandSubtitle: "Vault 기반 셀프서비스",
    topbarSubtitle: "업무 흐름을 먼저 보여주고, Vault 경로와 lease 정보는 상세 정보에서 확인합니다.",
    languageLabel: "언어",
    loading: "포털 데이터를 불러오는 중...",
    nav: {
      dashboard: "대시보드",
      secrets: "Secret 전체 현황",
      systems: "내 시스템",
      requests: "Secret 요청",
      approvals: "승인함",
      credentials: "활성 Credential",
      audit: "감사 리포트",
      health: "플랫폼 상태",
      plugins: "Vault Plugin Factory",
      users: "사용자 관리",
      admin: "관리"
    },
    login: {
      eyebrow: "Vault 기반 워크플로우 포털",
      title: "보안 셀프서비스 포털",
      description:
        "로컬 및 테스트 배포는 Mock 로그인과 Mock Vault로 시작합니다. 실제 Vault와 Keycloak 연동은 어댑터 뒤에서 단계적으로 활성화합니다."
    },
    dashboard: {
      title: "보안 운영 대시보드",
      description: "담당 시스템의 단기 Credential 발급, 승인 대기, Vault 기반 Secret Surface 상태를 한눈에 확인합니다.",
      modeLabel: "현재 모드",
      modeValue: "Mock Vault",
      metrics: {
        systems: "내 시스템",
        mapped: "개의 Secret Surface 매핑",
        pending: "승인 대기",
        waiting: "검토 대기 중",
        active: "활성 Credential",
        expiring: "개가 24시간 내 만료",
        failures: "폐기 실패",
        operator: "운영자 확인 필요"
      },
      posture: "Credential 상태",
      activeIssued: "활성 발급 Secret",
      mappedRoles: "매핑된 Vault Role",
      pendingApprovals: "승인 대기",
      latest: "최근 발급 Secret",
      noIssued: "아직 발급된 Credential이 없습니다.",
      recentIssuance: "최근 발급 이력",
      recentWorkflow: "최근 워크플로우 이벤트",
      pendingQueue: "승인 대기 큐",
      distribution: "Secret 유형 분포",
      lifecycle: "라이프사이클 상태",
      inventory: "발급 Secret 목록",
      surfaces: "Vault 기반 Secret Surface"
    },
    secrets: {
      title: "Vault 디펜던시 맵",
      description: "디펜던시 맵을 클릭해 시스템, Namespace, Mount, Role, Policy, 발급 Lease 관계를 확인합니다.",
      issued: "전체 발급",
      active: "활성",
      mapped: "매핑",
      distribution: "Secret 유형 분포",
      lifecycle: "라이프사이클 상태",
      pending: "대기",
      revoked: "폐기",
      failed: "실패",
      noIssued: "아직 발급된 Secret이 없습니다.",
      inventory: "발급 Secret 목록",
      surfaces: "Vault 기반 Secret Surface",
      nodes: "노드",
      edges: "연결",
      leases: "Lease",
      namespaces: "Namespace",
      mounts: "Mount",
      systems: "시스템",
      vaultCore: "Vault Core",
      topology: "디펜던시 맵",
      namespacePlane: "Namespace Plane",
      leaseOrbit: "Lease Orbit",
      pathFocus: "주요 의존 경로"
    },
    systems: {
      empty: "할당된 시스템이 없습니다.",
      owner: "소유 그룹",
      allowed: "허용 요청",
      advanced: "Vault 상세 정보"
    },
    request: {
      title: "요청 마법사",
      targetSystem: "대상 시스템",
      requestType: "요청 유형",
      reason: "업무 사유",
      submit: "요청 제출",
      defaultReason: "릴리스 검증을 위한 임시 접근"
    },
    approvals: {
      empty: "요청이 없습니다.",
      advanced: "Vault 상세 정보",
      approve: "승인",
      reject: "반려",
      execute: "실행"
    },
    credentials: {
      empty: "발급된 Credential이 없습니다.",
      expires: "만료",
      advanced: "Vault 상세 정보",
      revoke: "폐기"
    },
    audit: {
      title: "업무 워크플로우 감사"
    },
    admin: {
      health: "Vault 연동 상태",
      catalog: "Plugin 카탈로그",
      mappings: "시스템-Vault 매핑",
      inspection: "Vault 매핑 점검",
      yes: "예",
      no: "아니오",
      unknown: "알 수 없음"
    },
    table: {
      noData: "데이터가 없습니다.",
      system: "시스템",
      type: "유형",
      status: "상태",
      ttl: "TTL",
      action: "작업",
      actor: "사용자",
      target: "대상",
      result: "결과",
      requester: "요청자",
      risk: "위험도",
      secretType: "Secret 유형",
      maskedValue: "마스킹 값",
      expires: "만료",
      lease: "Lease",
      env: "환경",
      namespace: "Namespace",
      mount: "Mount",
      role: "Role",
      requestType: "요청 유형",
      time: "시간",
      mode: "모드",
      healthy: "정상",
      version: "버전",
      cluster: "클러스터",
      plugin: "Plugin",
      reachable: "연결"
    }
  }
} satisfies Record<Language, {
  brandTitle: string;
  brandSubtitle: string;
  topbarSubtitle: string;
  languageLabel: string;
  loading: string;
  nav: Record<View, string>;
  login: Record<"eyebrow" | "title" | "description", string>;
  dashboard: Record<string, string | Record<string, string>>;
  secrets: Record<string, string>;
  systems: Record<string, string>;
  request: Record<string, string>;
  approvals: Record<string, string>;
  credentials: Record<string, string>;
  audit: Record<string, string>;
  admin: Record<string, string>;
  table: Record<string, string>;
}>;

type Copy = (typeof copy)[Language];

export default function PortalShell({ view }: { view: View }) {
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [user, setUser] = useState<PortalUser | null>(null);
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [credentials, setCredentials] = useState<IssuedCredential[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [vaultHealth, setVaultHealth] = useState<VaultHealthResponse | null>(null);
  const [mappingHealth, setMappingHealth] = useState<VaultMappingHealth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const t = copy[language];

  function setPortalLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("security-portal-language", nextLanguage);
      document.documentElement.lang = nextLanguage;
    }
  }

  function setPortalTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("security-portal-theme", nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    }
  }

  async function refresh() {
    setError(null);
    if (!user) {
      setLoading(true);
    }
    try {
      const me = await api<{ user: PortalUser }>("/auth/me");
      setUser(me.user);
      const [systemsResponse, requestsResponse, credentialsResponse, auditResponse] = await Promise.all([
        api<{ systems: SystemSummary[] }>("/systems"),
        api<{ requests: AccessRequest[] }>("/requests"),
        api<{ credentials: IssuedCredential[] }>("/credentials"),
        api<{ auditEvents: AuditEvent[] }>("/audit-events")
      ]);
      setSystems(systemsResponse.systems);
      setRequests(requestsResponse.requests);
      setCredentials(credentialsResponse.credentials);
      setAuditEvents(auditResponse.auditEvents);

      try {
        const [vaultHealthResponse, mappingHealthResponse] = await Promise.all([
          api<VaultHealthResponse>("/health/vault"),
          api<{ mappings: VaultMappingHealth[] }>("/health/vault/mappings")
        ]);
        setVaultHealth(vaultHealthResponse);
        setMappingHealth(mappingHealthResponse.mappings);
      } catch {
        setVaultHealth(null);
        setMappingHealth([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load portal data";
      if (message.includes("401")) {
        setUser(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const storedLanguage =
      typeof window !== "undefined" ? window.localStorage.getItem("security-portal-language") : null;
    if (storedLanguage === "en" || storedLanguage === "ko") {
      setLanguage(storedLanguage);
      document.documentElement.lang = storedLanguage;
    }

    const storedTheme = typeof window !== "undefined" ? window.localStorage.getItem("security-portal-theme") : null;
    const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme: Theme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : prefersDark ? "dark" : "light";
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [view]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.toggle("navDrawerOpen", mobileNavOpen);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("navDrawerOpen");
    };
  }, [mobileNavOpen]);

  async function login(email: string) {
    setError(null);
    setLoading(true);
    try {
      await api("/auth/mock-login", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
      setLoading(false);
    }
  }

  async function logout() {
    setError(null);
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setSystems([]);
      setRequests([]);
      setCredentials([]);
      setAuditEvents([]);
      setVaultHealth(null);
      setMappingHealth([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out");
    }
  }

  const stats = useMemo(
    () => ({
      systems: systems.length,
      secretSurfaces: systems.reduce((count, system) => count + system.vaultMountMappings.length, 0),
      pending: requests.filter((request) => request.status === "pending").length,
      active: credentials.filter((credential) => credential.status === "active").length,
      failures: credentials.filter((credential) => credential.status === "revoke_failed").length,
      expiringSoon: credentials.filter((credential) => {
        if (credential.status !== "active") return false;
        const expiresAt = new Date(credential.expiresAt).getTime();
        return expiresAt > Date.now() && expiresAt - Date.now() < 24 * 60 * 60 * 1000;
      }).length
    }),
    [systems, requests, credentials]
  );

  if (!user) {
    return (
      <LoginScreen
        onLogin={login}
        error={error}
        language={language}
        loading={loading}
        setLanguage={setPortalLanguage}
        setTheme={setPortalTheme}
        theme={theme}
        t={t}
      />
    );
  }

  const visibleNavItems = navItems.filter((item) => canUseNavItem(user.roles, item));
  const canAccessView = visibleNavItems.some((item) => item.view === view);
  const vaultStatusTone = vaultHealth?.healthy ? "success" : vaultHealth ? "danger" : "neutral";
  const vaultStatusLabel = vaultHealth
    ? vaultHealth.healthy
      ? localize(t, `Vault connected · ${vaultHealth.mode}`, `Vault 연결됨 · ${vaultHealth.mode}`)
      : localize(t, "Vault needs attention", "Vault 확인 필요")
    : localize(t, "Checking Vault status", "Vault 상태 확인 중");

  return (
    <div className={mobileNavOpen ? "shell navOpen" : "shell"}>
      <aside className={mobileNavOpen ? "sidebar open" : "sidebar"} aria-label={localize(t, "Primary navigation", "주요 메뉴")}>
        <div className="sidebarHeader">
          <Link href="/dashboard" className="brand" aria-label="Go to dashboard">
            <span className="brandMark">V</span>
            <div>
              <strong>{t.brandTitle}</strong>
              <small>{t.brandSubtitle}</small>
            </div>
          </Link>
          <button
            aria-controls="portal-navigation"
            aria-expanded={mobileNavOpen}
            aria-label={localize(t, mobileNavOpen ? "Close navigation" : "Open navigation", mobileNavOpen ? "메뉴 닫기" : "메뉴 열기")}
            className="mobileNavToggle"
            onClick={() => setMobileNavOpen((current) => !current)}
            title={localize(t, mobileNavOpen ? "Close navigation" : "Open navigation", mobileNavOpen ? "메뉴 닫기" : "메뉴 열기")}
            type="button"
          >
            <X aria-hidden="true" size={20} strokeWidth={2} />
          </button>
        </div>
        <nav id="portal-navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.view}
                href={item.href}
                className={view === item.view ? "active" : ""}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
                <span>{t.nav[item.view]}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <button
        aria-hidden={!mobileNavOpen}
        aria-label={localize(t, "Close navigation", "메뉴 닫기")}
        className="navBackdrop"
        onClick={() => setMobileNavOpen(false)}
        tabIndex={mobileNavOpen ? 0 : -1}
        type="button"
      />

      <main className="main">
        <header className="topbar">
          <div className="topbarTitle">
            <button
              aria-controls="portal-navigation"
              aria-expanded={mobileNavOpen}
              aria-label={localize(t, "Open navigation", "메뉴 열기")}
              className="mobileNavTrigger iconButton"
              onClick={() => setMobileNavOpen(true)}
              title={localize(t, "Open navigation", "메뉴 열기")}
              type="button"
            >
              <Menu aria-hidden="true" size={20} />
            </button>
            <div>
              <h1>{t.nav[view]}</h1>
              <StatusIndicator label={vaultStatusLabel} tone={vaultStatusTone} />
            </div>
          </div>
          <div className="topbarTools">
            <div className="languageSwitch" aria-label={t.languageLabel}>
              <button aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setPortalLanguage("en")}>
                EN
              </button>
              <button aria-pressed={language === "ko"} className={language === "ko" ? "active" : ""} onClick={() => setPortalLanguage("ko")}>
                한글
              </button>
            </div>
            <button
              aria-label={localize(t, theme === "light" ? "Use dark theme" : "Use light theme", theme === "light" ? "다크 테마 사용" : "라이트 테마 사용")}
              className="iconButton themeToggle"
              onClick={() => setPortalTheme(theme === "light" ? "dark" : "light")}
              title={localize(t, theme === "light" ? "Use dark theme" : "Use light theme", theme === "light" ? "다크 테마 사용" : "라이트 테마 사용")}
              type="button"
            >
              {theme === "light" ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
            </button>
            <div className="userBadge">
              <div>
                <span>{user?.displayName ?? t.loading}</span>
                <small>{user?.roles.join(", ")}</small>
              </div>
              <button
                aria-label={localize(t, "Sign out", "로그아웃")}
                className="iconButton"
                onClick={() => void logout()}
                title={localize(t, "Sign out", "로그아웃")}
                type="button"
              >
                <LogOut aria-hidden="true" size={17} />
              </button>
            </div>
          </div>
        </header>

        {error ? <PortalState detail={error} kind="error" title={localize(t, "Unable to load this view", "화면을 불러오지 못했습니다")} /> : null}
        {loading ? <PortalState kind="loading" title={t.loading} /> : null}
        {!loading && !canAccessView ? (
          <PortalState
            detail={localize(t, "Your current role does not include this workspace.", "현재 역할에는 이 업무 화면의 접근 권한이 없습니다.")}
            kind="permission"
            title={localize(t, "Access restricted", "접근 권한이 없습니다")}
          />
        ) : null}

        <div className="pageSurface" key={view}>
        {!loading && canAccessView && view === "dashboard" ? (
          <Dashboard
            t={t}
            stats={stats}
            systems={systems}
            requests={requests}
            credentials={credentials}
            auditEvents={auditEvents}
          />
        ) : null}
        {!loading && canAccessView && view === "secrets" ? (
          <SecretInventory t={t} systems={systems} requests={requests} credentials={credentials} />
        ) : null}
        {!loading && canAccessView && view === "systems" ? <Systems t={t} systems={systems} /> : null}
        {!loading && canAccessView && view === "requests" ? <RequestForm t={t} systems={systems} onChanged={refresh} /> : null}
        {!loading && canAccessView && view === "approvals" ? (
          <Approvals t={t} currentUser={user} requests={requests} auditEvents={auditEvents} onChanged={refresh} />
        ) : null}
        {!loading && canAccessView && view === "credentials" ? (
          <Credentials t={t} currentUser={user} credentials={credentials} requests={requests} onChanged={refresh} />
        ) : null}
        {!loading && canAccessView && view === "audit" ? <Audit t={t} events={auditEvents} /> : null}
        {!loading && canAccessView && view === "health" ? (
          <PlatformHealth t={t} vaultHealth={vaultHealth} mappingHealth={mappingHealth} />
        ) : null}
        {!loading && canAccessView && view === "plugins" ? <PluginFactory t={t} currentUser={user} onChanged={refresh} /> : null}
        {!loading && canAccessView && view === "users" ? (
          <UserManagement t={t} currentUser={user} systems={systems} auditEvents={auditEvents} onChanged={refresh} />
        ) : null}
        {!loading && canAccessView && view === "admin" ? (
          <Admin t={t} systems={systems} vaultHealth={vaultHealth} mappingHealth={mappingHealth} />
        ) : null}
        </div>
      </main>
    </div>
  );
}

function LoginScreen({
  onLogin,
  error,
  language,
  loading,
  setLanguage,
  setTheme,
  theme,
  t
}: {
  onLogin: (email: string) => Promise<void>;
  error: string | null;
  language: Language;
  loading: boolean;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  theme: Theme;
  t: Copy;
}) {
  const users = ["developer@example.com", "approver@example.com", "admin@example.com", "auditor@example.com"];
  return (
    <main className="login">
      <section>
        <div className="loginTopline">
          <span className="eyebrow">{t.login.eyebrow}</span>
          <div className="loginControls">
            <div className="languageSwitch compact" aria-label={t.languageLabel}>
              <button aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>
                EN
              </button>
              <button aria-pressed={language === "ko"} className={language === "ko" ? "active" : ""} onClick={() => setLanguage("ko")}>
                한글
              </button>
            </div>
            <button
              aria-label={localize(t, theme === "light" ? "Use dark theme" : "Use light theme", theme === "light" ? "다크 테마 사용" : "라이트 테마 사용")}
              className="iconButton themeToggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={localize(t, theme === "light" ? "Use dark theme" : "Use light theme", theme === "light" ? "다크 테마 사용" : "라이트 테마 사용")}
              type="button"
            >
              {theme === "light" ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
            </button>
          </div>
        </div>
        <h1>{t.login.title}</h1>
        <p>{t.login.description}</p>
        {loading ? <PortalState compact kind="loading" title={t.loading} /> : null}
        {error ? <PortalState compact detail={error} kind="error" title={localize(t, "Sign-in failed", "로그인에 실패했습니다")} /> : null}
        <div className="loginGrid">
          {users.map((email) => (
            <button key={email} disabled={loading} onClick={() => void onLogin(email)}>
              {email}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusIndicator({ label, tone }: { label: string; tone: "success" | "danger" | "neutral" }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? AlertTriangle : CircleGauge;
  return (
    <span className={`statusIndicator status-${tone}`}>
      <Icon aria-hidden="true" size={14} strokeWidth={2.2} />
      <span>{label}</span>
    </span>
  );
}

function PortalState({
  compact = false,
  detail,
  kind,
  title
}: {
  compact?: boolean;
  detail?: string;
  kind: "loading" | "error" | "empty" | "permission";
  title: string;
}) {
  const Icon = kind === "loading" ? LoaderCircle : kind === "error" ? AlertTriangle : kind === "permission" ? ShieldAlert : Inbox;
  return (
    <div aria-live={kind === "error" ? "assertive" : "polite"} className={`portalState ${kind}${compact ? " compact" : ""}`} role={kind === "error" ? "alert" : "status"}>
      <span className="portalStateIcon">
        <Icon aria-hidden="true" className={kind === "loading" ? "spin" : ""} size={compact ? 18 : 21} />
      </span>
      <div>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
    </div>
  );
}

function Dashboard({
  t,
  stats,
  systems,
  requests,
  credentials,
  auditEvents
}: {
  t: Copy;
  stats: DashboardStats;
  systems: SystemSummary[];
  requests: AccessRequest[];
  credentials: IssuedCredential[];
  auditEvents: AuditEvent[];
}) {
  const recentCredential = credentials[0];
  const secretSurfaces = systems.flatMap((system) =>
    system.vaultMountMappings.map((mapping) => ({
      systemName: system.name,
      namespace: system.vaultNamespace,
      environment: system.environment,
      ...mapping
    }))
  );
  const active = credentials.filter((credential) => credential.status === "active");
  const revoked = credentials.filter((credential) => credential.status === "revoked");
  const pending = requests.filter((request) => request.status === "pending");
  const failed = credentials.filter((credential) => credential.status === "revoke_failed");
  const typeCounts = credentials.reduce<Record<string, number>>((acc, credential) => {
    acc[credential.requestType] = (acc[credential.requestType] ?? 0) + 1;
    return acc;
  }, {});
  const maxTypeCount = Math.max(...Object.values(typeCounts), 1);
  const requestCountsBySystem = requests.reduce<Record<string, number>>((acc, request) => {
    acc[request.systemName] = (acc[request.systemName] ?? 0) + 1;
    return acc;
  }, {});
  const maxSystemRequestCount = Math.max(...Object.values(requestCountsBySystem), 1);
  const systemsByName = new Map(systems.map((system) => [system.name, system]));
  const highRiskRequests = requests
    .map((request) => {
      const system = systemsByName.get(request.systemName);
      return {
        request,
        risk: scoreRisk({
          requestType: request.requestType,
          ttl: request.ttl,
          environment: system?.environment ?? "dev",
          scope: String(request.payload.scope ?? request.payload.permission ?? request.payload.project ?? ""),
          riskLevel: request.riskLevel
        })
      };
    })
    .filter(({ risk }) => risk.level === "high")
    .slice(0, 5);
  const recentSecurityEvents = auditEvents
    .filter((event) => /approve|reject|revoke|expire|execute/i.test(event.action))
    .slice(0, 6);

  return (
    <div className="stack">
      <section className="overviewPanel">
        <div>
          <h2>{t.dashboard.title}</h2>
          <p>{t.dashboard.description}</p>
        </div>
        <div className="overviewAside">
          <span>{t.dashboard.modeLabel}</span>
          <strong>{t.dashboard.modeValue}</strong>
        </div>
      </section>
      <section className="executivePanel">
        <div>
          <span className="eyebrow">{localize(t, "Security executive view", "보안 임원 요약")}</span>
          <h2>{localize(t, "Executive / Security Summary", "Executive / Security Summary")}</h2>
          <p>
            {localize(
              t,
              "Vault-backed secret surfaces, active leases, expiring credentials, failed revocations, and high-risk approval items are summarized for security operations.",
              "Vault 기반 Secret Surface, 활성 Lease, 만료 임박 Credential, 폐기 실패, 고위험 승인 요청을 보안 운영 관점으로 요약합니다."
            )}
          </p>
        </div>
        <div className="summaryRail">
          <MiniStat label={localize(t, "Total secrets", "전체 Secret")} value={credentials.length} />
          <MiniStat label={localize(t, "Active credentials", "활성 Credential")} value={stats.active} tone="good" />
          <MiniStat label={localize(t, "Expiring soon", "만료 임박")} value={stats.expiringSoon} />
          <MiniStat label={localize(t, "Revoke failures", "폐기 실패")} value={stats.failures} tone="risk" />
        </div>
      </section>
      <div className="metrics">
        <Metric
          label={t.dashboard.metrics.systems}
          value={stats.systems}
          detail={
            t === copy.ko
              ? `${stats.secretSurfaces}${t.dashboard.metrics.mapped}`
              : `${stats.secretSurfaces} ${t.dashboard.metrics.mapped}`
          }
        />
        <Metric label={t.dashboard.metrics.pending} value={stats.pending} detail={t.dashboard.metrics.waiting} />
        <Metric
          label={t.dashboard.metrics.active}
          value={stats.active}
          detail={
            t === copy.ko
              ? `${stats.expiringSoon}${t.dashboard.metrics.expiring}`
              : `${stats.expiringSoon} ${t.dashboard.metrics.expiring}`
          }
        />
        <Metric label={t.dashboard.metrics.failures} value={stats.failures} detail={t.dashboard.metrics.operator} tone="risk" />
      </div>
      <div className="dashboardGrid">
        <section className="insightPanel">
          <h2>{t.dashboard.posture}</h2>
          <div className="postureRows">
            <PostureRow label={t.dashboard.activeIssued} value={stats.active} max={Math.max(credentials.length, 1)} />
            <PostureRow label={t.dashboard.mappedRoles} value={stats.secretSurfaces} max={Math.max(stats.secretSurfaces, 1)} />
            <PostureRow label={t.dashboard.pendingApprovals} value={stats.pending} max={Math.max(requests.length, 1)} />
          </div>
        </section>
        <section className="insightPanel">
          <h2>{t.dashboard.latest}</h2>
          {recentCredential ? (
            <div className="latestSecret">
              <span className={`statusDot ${recentCredential.status}`} />
              <div>
                <strong>{recentCredential.systemName}</strong>
                <p>{recentCredential.requestType}</p>
              </div>
              <code>{recentCredential.maskedDisplayValue}</code>
            </div>
          ) : (
            <div className="empty compact">{t.dashboard.noIssued}</div>
          )}
        </section>
      </div>
      <div className="dashboardGrid">
        <section className="insightPanel">
          <h2>{t.dashboard.distribution}</h2>
          {Object.entries(typeCounts).length === 0 ? (
            <div className="empty compact">{t.secrets.noIssued}</div>
          ) : (
            <div className="postureRows">
              {Object.entries(typeCounts).map(([type, count]) => (
                <PostureRow key={type} label={type} value={count} max={maxTypeCount} />
              ))}
            </div>
          )}
        </section>
        <section className="insightPanel">
          <h2>{t.dashboard.lifecycle}</h2>
          <div className="lifecycleGrid">
            <MiniStat label={t.secrets.active} value={active.length} tone="good" />
            <MiniStat label={t.secrets.pending} value={pending.length} />
            <MiniStat label={t.secrets.revoked} value={revoked.length} />
            <MiniStat label={t.secrets.failed} value={failed.length} tone="risk" />
          </div>
        </section>
      </div>
      <div className="dashboardGrid">
        <section className="insightPanel">
          <h2>{localize(t, "Requests by system", "시스템별 요청량")}</h2>
          <div className="postureRows">
            {Object.entries(requestCountsBySystem).length === 0 ? (
              <div className="empty compact">{t.table.noData}</div>
            ) : (
              Object.entries(requestCountsBySystem).map(([systemName, count]) => (
                <PostureRow key={systemName} label={systemName} value={count} max={maxSystemRequestCount} />
              ))
            )}
          </div>
        </section>
        <section className="insightPanel">
          <h2>{localize(t, "High-risk requests", "위험도 높은 요청")}</h2>
          {highRiskRequests.length === 0 ? (
            <div className="empty compact">{localize(t, "No high-risk request currently queued.", "현재 고위험 요청이 없습니다.")}</div>
          ) : (
            <div className="riskRequestList">
              {highRiskRequests.map(({ request, risk }) => (
                <div key={request.id} className="riskRequestItem">
                  <div>
                    <strong>{request.systemName}</strong>
                    <span>
                      {request.requestType} / {request.ttl}
                    </span>
                  </div>
                  <RiskBadge risk={risk} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <Table
        title={t.dashboard.recentIssuance}
        columns={[t.table.system, t.table.type, t.table.status, t.table.ttl]}
        rows={credentials.slice(0, 6).map((credential) => [
          credential.systemName,
          credential.requestType,
          credential.status,
          credential.ttl
        ])}
        emptyLabel={t.table.noData}
      />
      <Table
        title={localize(t, "Recent approval / reject / revoke events", "최근 승인/반려/폐기 이벤트")}
        columns={[t.table.action, t.table.actor, t.table.target, t.table.result]}
        rows={recentSecurityEvents.map((event) => [event.action, event.actorEmail, event.targetType, event.result])}
        emptyLabel={t.table.noData}
      />
      <Table
        title={t.dashboard.pendingQueue}
        columns={[t.table.system, t.table.type, t.table.requester, t.table.risk]}
        rows={requests
          .filter((request) => request.status === "pending")
          .map((request) => [request.systemName, request.requestType, request.requesterEmail, request.riskLevel])}
        emptyLabel={t.table.noData}
      />
      <section className="tablePanel">
        <h2>{t.dashboard.inventory}</h2>
        {credentials.length === 0 ? (
          <div className="empty compact">{t.secrets.noIssued}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t.table.system}</th>
                <th>{t.table.secretType}</th>
                <th>{t.table.status}</th>
                <th>{t.table.maskedValue}</th>
                <th>{t.table.ttl}</th>
                <th>{t.table.expires}</th>
                <th>{t.table.lease}</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((credential) => (
                <tr key={credential.id}>
                  <td>{credential.systemName}</td>
                  <td>{credential.requestType}</td>
                  <td>
                    <span className={`statusBadge ${credential.status}`}>{credential.status}</span>
                  </td>
                  <td>
                    <code>{credential.maskedDisplayValue}</code>
                  </td>
                  <td>{credential.ttl}</td>
                  <td>{formatDate(credential.expiresAt)}</td>
                  <td className="monoCell">{shortId(credential.vaultLeaseId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Table
        title={t.dashboard.surfaces}
        columns={[t.table.system, t.table.env, t.table.namespace, t.table.mount, t.table.role, t.table.requestType]}
        rows={secretSurfaces.map((surface) => [
          surface.systemName,
          surface.environment,
          surface.namespace,
          surface.mountPath,
          surface.roleName,
          surface.requestType
        ])}
        emptyLabel={t.table.noData}
      />
    </div>
  );
}

function SecretInventory({
  t,
  systems,
  requests,
  credentials
}: {
  t: Copy;
  systems: SystemSummary[];
  requests: AccessRequest[];
  credentials: IssuedCredential[];
}) {
  const secretSurfaces = useMemo(() => buildSecretSurfaces(systems), [systems]);
  const active = credentials.filter((credential) => credential.status === "active");
  const pending = requests.filter((request) => request.status === "pending");
  const namespaces = Array.from(new Set(systems.map((system) => system.vaultNamespace)));
  const mapModel = useMemo(
    () => buildDependencyMapModel(systems, secretSurfaces, credentials),
    [credentials, secretSurfaces, systems]
  );
  const [selectedNodeId, setSelectedNodeId] = useState("vault");
  const selectedNode =
    mapModel.nodes.find((node) => node.id === selectedNodeId) ?? {
      id: "vault",
      kind: "vault" as const,
      label: "Vault",
      sublabel: "Enterprise core",
      x: 50,
      y: 10
    };
  const mountGroups = secretSurfaces.reduce<Record<string, number>>((acc, surface) => {
    acc[surface.mountPath] = (acc[surface.mountPath] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="dependencyStack">
      <section className="dependencyIntro">
        <div>
          <h2>{t.secrets.title}</h2>
          <p>{t.secrets.description}</p>
        </div>
        <div className="dependencyVitals">
          <MiniStat label={t.secrets.nodes} value={mapModel.nodes.length} />
          <MiniStat label={t.secrets.edges} value={mapModel.edges.length} />
          <MiniStat label={t.secrets.leases} value={credentials.length} />
        </div>
      </section>

      <section className="dependencyMapSurface" aria-label={t.secrets.topology}>
        <div className="dependencyMapGrid">
          <div className="dependencyMapCanvas" data-testid="vault-dependency-map">
            <svg className="dependencyLines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {mapModel.edges.map((edge) => {
                const from = mapModel.nodes.find((node) => node.id === edge.from);
                const to = mapModel.nodes.find((node) => node.id === edge.to);
                if (!from || !to) return null;
                const midY = (from.y + to.y) / 2;
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    className={`dependencyLine ${edge.tone}`}
                    d={`M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`}
                  />
                );
              })}
            </svg>
            <div className="dependencyLanes" aria-hidden="true">
              <span>{t.secrets.vaultCore}</span>
              <span>{t.secrets.namespaces}</span>
              <span>{t.secrets.systems}</span>
              <span>{t.secrets.mounts}</span>
              <span>{t.secrets.leases}</span>
            </div>
            {mapModel.nodes.map((node) => (
              <button
                key={node.id}
                className={`dependencyNode ${node.kind} ${node.id === selectedNode.id ? "selected" : ""}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                onClick={() => setSelectedNodeId(node.id)}
                type="button"
              >
                <span>{node.label}</span>
                <small>{node.sublabel}</small>
              </button>
            ))}
          </div>
          <DependencyDetail
            t={t}
            node={selectedNode}
            surfaces={secretSurfaces}
            requests={requests}
            credentials={credentials}
          />
        </div>
        <div className="mapOverlay mapOverlayTop">
          <span>{t.secrets.vaultCore}</span>
          <strong>{t.secrets.topology}</strong>
        </div>
        <div className="mapLegend" aria-label="Map legend">
          <span><i className="legendDot vault" />{t.secrets.vaultCore}</span>
          <span><i className="legendDot namespace" />{t.secrets.namespaces}</span>
          <span><i className="legendDot system" />{t.secrets.systems}</span>
          <span><i className="legendDot lease" />{t.secrets.leases}</span>
        </div>
      </section>

      <div className="dependencyPanels">
        <section className="dependencyPanel">
          <h2>{t.secrets.namespacePlane}</h2>
          <div className="dependencyChipCloud">
            {namespaces.map((namespace) => (
              <span key={namespace}>{namespace}</span>
            ))}
          </div>
        </section>
        <section className="dependencyPanel">
          <h2>{t.secrets.mounts}</h2>
          <div className="dependencyChipCloud">
            {Object.entries(mountGroups).map(([mount, count]) => (
              <span key={mount}>{mount} · {count}</span>
            ))}
          </div>
        </section>
        <section className="dependencyPanel">
          <h2>{t.secrets.leaseOrbit}</h2>
          <div className="dependencyOrbitStats">
            <MiniStat label={t.secrets.active} value={active.length} tone="good" />
            <MiniStat label={t.secrets.pending} value={pending.length} />
            <MiniStat
              label={t.secrets.failed}
              value={credentials.filter((credential) => credential.status === "revoke_failed").length}
              tone="risk"
            />
          </div>
        </section>
        <section className="dependencyPanel wide">
          <h2>{t.secrets.pathFocus}</h2>
          <div className="dependencyPathList">
            {secretSurfaces.slice(0, 6).map((surface) => (
              <div key={`${surface.systemName}-${surface.mountPath}-${surface.roleName}`}>
                <strong>{surface.systemName}</strong>
                <span>{surface.namespace} / {surface.mountPath} / {surface.roleName}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

type SecretSurface = {
  id: string;
  systemId: string;
  systemName: string;
  systemDescription: string;
  ownerGroup: string;
  environment: SystemSummary["environment"];
  namespace: string;
  mountPath: string;
  roleName: string;
  requestType: RequestType;
  displayName: string;
  enabled: boolean;
};

type DependencyNode = {
  id: string;
  kind: "vault" | "namespace" | "system" | "surface" | "credential";
  label: string;
  sublabel: string;
  x: number;
  y: number;
  namespace?: string;
  systemName?: string;
  surface?: SecretSurface;
  credential?: IssuedCredential;
};

type DependencyEdge = {
  from: string;
  to: string;
  tone: "vault" | "namespace" | "system" | "lease";
};

function DependencyDetail({
  t,
  node,
  surfaces,
  requests,
  credentials
}: {
  t: Copy;
  node: DependencyNode;
  surfaces: SecretSurface[];
  requests: AccessRequest[];
  credentials: IssuedCredential[];
}) {
  const relatedSurfaces = getRelatedSurfaces(node, surfaces);
  const relatedCredentials = getRelatedCredentials(node, surfaces, credentials);
  const primarySurface = node.surface ?? relatedSurfaces[0];
  const primaryCredential = node.credential ?? relatedCredentials[0];
  const primaryRequest = primaryCredential
    ? requests.find((request) => request.id === primaryCredential.requestId)
    : requests.find(
        (request) =>
          primarySurface &&
          request.systemName === primarySurface.systemName &&
          request.requestType === primarySurface.requestType
      );
  const risk = primarySurface
    ? scoreRisk({
        requestType: primarySurface.requestType,
        environment: primarySurface.environment,
        ttl: primaryCredential?.ttl ?? primaryRequest?.ttl ?? "1h",
        scope: `${primarySurface.roleName} ${primarySurface.displayName}`,
        riskLevel: primaryRequest?.riskLevel
      })
    : null;

  return (
    <aside className="dependencyDetailPanel">
      <div className="detailTopline">
        <span className={`nodeKind ${node.kind}`}>{node.kind}</span>
        {risk ? <RiskBadge risk={risk} /> : null}
      </div>
      <h2>{node.label}</h2>
      <p>{node.sublabel}</p>

      <div className="detailStats">
        <MiniStat label={localize(t, "Mapped roles", "매핑 Role")} value={relatedSurfaces.length} />
        <MiniStat label={localize(t, "Issued", "발급")} value={relatedCredentials.length} />
        <MiniStat
          label={localize(t, "Active", "활성")}
          value={relatedCredentials.filter((credential) => credential.status === "active").length}
          tone="good"
        />
      </div>

      {primarySurface ? (
        <dl className="compactDl">
          <dt>{t.table.system}</dt>
          <dd>{primarySurface.systemName}</dd>
          <dt>{t.table.namespace}</dt>
          <dd>{primarySurface.namespace}</dd>
          <dt>{t.table.mount}</dt>
          <dd>{primarySurface.mountPath}</dd>
          <dt>{t.table.role}</dt>
          <dd>{primarySurface.roleName}</dd>
          <dt>{localize(t, "Policy", "Policy")}</dt>
          <dd>{policyName(primarySurface)}</dd>
          <dt>{t.table.requestType}</dt>
          <dd>{primarySurface.requestType}</dd>
        </dl>
      ) : (
        <div className="empty compact">
          {localize(t, "Select a system, mount, or lease to inspect its Vault relationship.", "시스템, Mount, Lease를 선택하면 Vault 관계를 확인할 수 있습니다.")}
        </div>
      )}

      {primaryCredential ? (
        <div className="selectedCredential">
          <h3>{localize(t, "Selected credential", "선택된 Credential")}</h3>
          <code>{primaryCredential.maskedDisplayValue}</code>
          <dl className="compactDl">
            <dt>{t.table.status}</dt>
            <dd>
              <span className={`statusBadge ${primaryCredential.status}`}>{primaryCredential.status}</span>
            </dd>
            <dt>{t.table.ttl}</dt>
            <dd>{primaryCredential.ttl}</dd>
            <dt>{t.table.expires}</dt>
            <dd>{formatDate(primaryCredential.expiresAt)}</dd>
            <dt>{t.table.lease}</dt>
            <dd>{shortId(primaryCredential.vaultLeaseId)}</dd>
          </dl>
          <LifecycleTimeline steps={credentialLifecycleSteps(t, primaryRequest, primaryCredential)} />
        </div>
      ) : null}

      {risk ? (
        <div className="riskExplanation">
          <strong>{localize(t, "Approval rule explanation", "승인 규칙 설명")}</strong>
          <ul>
            {risk.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

function Systems({ t, systems }: { t: Copy; systems: SystemSummary[] }) {
  if (systems.length === 0) return <div className="empty">{t.systems.empty}</div>;
  return (
    <div className="grid">
      {systems.map((system) => (
        <article className="card" key={system.id}>
          <div className="cardHeader">
            <div>
              <h2>{system.name}</h2>
              <p>{system.description}</p>
            </div>
            <span className={`pill ${system.environment}`}>{system.environment}</span>
          </div>
          <dl>
            <dt>{t.systems.owner}</dt>
            <dd>{system.ownerGroup}</dd>
            <dt>{t.systems.allowed}</dt>
            <dd>{system.allowedRequestTypes.join(", ")}</dd>
          </dl>
          <details>
            <summary>{t.systems.advanced}</summary>
            <pre>{JSON.stringify({ namespace: system.vaultNamespace, mappings: system.vaultMountMappings }, null, 2)}</pre>
          </details>
        </article>
      ))}
    </div>
  );
}

function RequestForm({ t, systems, onChanged }: { t: Copy; systems: SystemSummary[]; onChanged: () => Promise<void> }) {
  const [systemId, setSystemId] = useState(systems[0]?.id ?? "");
  const [requestType, setRequestType] = useState<RequestType>(systems[0]?.allowedRequestTypes[0] ?? "CUSTOM_GITLAB_TOKEN");
  const [reason, setReason] = useState(t.request.defaultReason);
  const [ttl, setTtl] = useState("1h");
  const [scope, setScope] = useState("read_api");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const selectedSystem = systems.find((system) => system.id === systemId);
  const allowedTypes = selectedSystem?.allowedRequestTypes.length ? selectedSystem.allowedRequestTypes : requestTypes;
  const risk = scoreRisk({
    requestType,
    ttl,
    environment: selectedSystem?.environment ?? "dev",
    scope,
    riskLevel: "medium"
  });

  async function submit() {
    setBusy(true);
    setSubmitError(null);
    setSubmitMessage(null);
    try {
      await api("/requests", {
        method: "POST",
        body: JSON.stringify({
          systemId,
          requestType,
          reason,
          ttl,
          riskLevel: risk.level,
          payload: { project: selectedSystem?.name ?? "unknown", scope, approvalModel: "workflow-wizard" }
        })
      });
      await onChanged();
      setStep(0);
      setSubmitMessage(localize(t, "Request submitted for approval.", "요청을 승인 대기열에 제출했습니다."));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : localize(t, "Unable to submit request.", "요청을 제출하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="formPanel wizardPanel">
      <div className="wizardHeader">
        <div>
          <span className="eyebrow">{localize(t, "Workflow request", "워크플로우 요청")}</span>
          <h2>{t.request.title}</h2>
          <p>
            {localize(
              t,
              "Select the target system, request type, permission scope, TTL, and risk posture before submitting.",
              "대상 시스템, 요청 유형, 권한 범위, TTL, 위험도를 확인한 뒤 요청을 제출합니다."
            )}
          </p>
        </div>
        <RiskBadge risk={risk} />
      </div>

      <div className="wizardSteps" aria-label="Request wizard steps">
        {[
          localize(t, "System", "시스템"),
          localize(t, "Type", "유형"),
          localize(t, "Scope / TTL", "권한 / TTL"),
          localize(t, "Risk confirm", "위험도 확인")
        ].map((label, index) => (
          <button key={label} className={step === index ? "active" : ""} onClick={() => setStep(index)} type="button">
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="wizardPage">
          <label>
            {t.request.targetSystem}
            <select
              value={systemId}
              onChange={(event) => {
                const nextSystem = systems.find((system) => system.id === event.target.value);
                setSystemId(event.target.value);
                setRequestType(nextSystem?.allowedRequestTypes[0] ?? "CUSTOM_GITLAB_TOKEN");
              }}
            >
              {systems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name} / {system.environment}
                </option>
              ))}
            </select>
          </label>
          {selectedSystem ? (
            <div className="selectionSummary">
              <strong>{selectedSystem.name}</strong>
              <span>{selectedSystem.description}</span>
              <code>{selectedSystem.vaultNamespace}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="wizardPage requestTypeGrid">
          {allowedTypes.map((type) => (
            <button
              key={type}
              className={requestType === type ? "selected" : ""}
              onClick={() => setRequestType(type)}
              type="button"
            >
              <strong>{type}</strong>
              <span>{requestTypeDescription(t, type)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="wizardPage twoColumnForm">
          <label>
            {localize(t, "Permission scope", "권한 범위")}
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="read_api">read_api</option>
              <option value="read_write">read_write</option>
              <option value="maintainer">maintainer</option>
              <option value="db_read">db_read</option>
              <option value="db_write">db_write</option>
            </select>
          </label>
          <label>
            TTL
            <select value={ttl} onChange={(event) => setTtl(event.target.value)}>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="8h">8h</option>
              <option value="24h">24h</option>
            </select>
          </label>
          <label className="wideField">
            {t.request.reason}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="wizardPage confirmGrid">
          <div className="selectionSummary">
            <strong>{localize(t, "Request summary", "요청 요약")}</strong>
            <span>{selectedSystem?.name} / {requestType} / {ttl} / {scope}</span>
            <code>{reason}</code>
          </div>
          <div className="riskExplanation">
            <strong>{localize(t, "Risk score and approval rule", "위험도 점수 및 승인 규칙")}</strong>
            <RiskBadge risk={risk} />
            <ul>
              {risk.reasons.map((riskReason) => (
                <li key={riskReason}>{riskReason}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {submitError ? <div className="error">{submitError}</div> : null}
      {submitMessage ? <div className="noticePanel compact">{submitMessage}</div> : null}

      <div className="wizardActions">
        <button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button">
          {localize(t, "Back", "이전")}
        </button>
        {step < 3 ? (
          <button className="primary" disabled={!systemId} onClick={() => setStep((current) => Math.min(3, current + 1))} type="button">
            {localize(t, "Next", "다음")}
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy || !systemId || reason.trim().length < 3}
            onClick={() => void submit()}
            type="button"
          >
            {t.request.submit}
          </button>
        )}
      </div>
    </section>
  );
}

function Approvals({
  t,
  currentUser,
  requests,
  auditEvents,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser | null;
  requests: AccessRequest[];
  auditEvents: AuditEvent[];
  onChanged: () => Promise<void>;
}) {
  const [ttlOverrides, setTtlOverrides] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [conditionNotes, setConditionNotes] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const canReview = currentUser?.roles.some((role) =>
    (["security-approver", "vault-admin", "app-owner"] as UserRole[]).includes(role)
  ) ?? false;

  async function act(id: string, action: "approve" | "reject" | "execute", conditional = false) {
    setActionError(null);
    setBusyRequestId(id);
    try {
      const body =
        action === "approve"
          ? JSON.stringify({
              ttl: ttlOverrides[id],
              note: conditional ? conditionNotes[id]?.trim() : undefined
            })
          : action === "reject"
            ? JSON.stringify({ reason: rejectReasons[id]?.trim() })
            : undefined;
      await api(`/requests/${id}/${action}`, { method: "POST", body });
      await onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : localize(t, "Unable to update request.", "요청을 처리하지 못했습니다."));
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <div className="stack">
      {!canReview ? (
        <div className="noticePanel">
          {localize(
            t,
            "Approval and rejection require the security-approver, app-owner, or vault-admin role.",
            "승인과 반려는 security-approver, app-owner 또는 vault-admin 권한이 필요합니다."
          )}
        </div>
      ) : null}
      {actionError ? <div className="error">{actionError}</div> : null}
      {requests.length === 0 ? <div className="empty">{t.approvals.empty}</div> : null}
      {requests.map((request) => (
        <article className="card approvalCard" key={request.id}>
          <div className="approvalMain">
            <div>
              <div className="detailTopline">
                <span className={`statusBadge ${request.status}`}>{request.status}</span>
                <RiskBadge
                  risk={scoreRisk({
                    requestType: request.requestType,
                    ttl: ttlOverrides[request.id] ?? request.ttl,
                    environment: request.systemName.toLowerCase().includes("prod") ? "prod" : "dev",
                    scope: String(request.payload.scope ?? ""),
                    riskLevel: request.riskLevel
                  })}
                />
              </div>
              <h2>{request.systemName}</h2>
              <p>{request.reason}</p>
              <small>
                {request.requesterEmail} / {request.requestType} / {request.ttl}
              </small>
            </div>
            <div className="approvalControls">
              <label>
                {localize(t, "Approve TTL", "승인 TTL")}
                <select
                  disabled={!canReview || request.status !== "pending"}
                  value={ttlOverrides[request.id] ?? request.ttl}
                  onChange={(event) =>
                    setTtlOverrides((current) => ({ ...current, [request.id]: event.target.value }))
                  }
                >
                  <option value={request.ttl}>{request.ttl}</option>
                  <option value="30m">30m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="8h">8h</option>
                </select>
              </label>
              <label>
                {localize(t, "Conditional approval note", "조건부 승인 메모")}
                <textarea
                  disabled={!canReview || request.status !== "pending"}
                  value={conditionNotes[request.id] ?? ""}
                  placeholder={localize(t, "Example: approve only for release window", "예: 릴리스 시간대에만 승인")}
                  onChange={(event) =>
                    setConditionNotes((current) => ({ ...current, [request.id]: event.target.value }))
                  }
                />
              </label>
              <label>
                {localize(t, "Reject reason", "반려 사유")}
                <textarea
                  disabled={!canReview || request.status !== "pending"}
                  value={rejectReasons[request.id] ?? ""}
                  placeholder={localize(t, "Enter at least 3 characters", "3자 이상의 반려 사유를 입력하세요")}
                  onChange={(event) =>
                    setRejectReasons((current) => ({ ...current, [request.id]: event.target.value }))
                  }
                />
              </label>
            </div>
          </div>
          <div className="approvalFooter">
            <div>
              <strong>{localize(t, "Approval history", "승인 히스토리")}</strong>
              <LifecycleTimeline steps={requestLifecycleSteps(t, request, auditEvents)} compact />
            </div>
            <details>
              <summary>{t.approvals.advanced}</summary>
              <pre>
                {JSON.stringify(
                  {
                    payload: request.payload,
                    ttl_override: ttlOverrides[request.id],
                    conditional_approval_note: conditionNotes[request.id],
                    reject_reason: rejectReasons[request.id]
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
          <div className="actions">
            <button
              disabled={!canReview || request.status !== "pending" || busyRequestId === request.id}
              onClick={() => void act(request.id, "approve")}
            >
              {t.approvals.approve}
            </button>
            <button
              className="primaryGhost"
              disabled={
                !canReview ||
                request.status !== "pending" ||
                busyRequestId === request.id ||
                !conditionNotes[request.id]?.trim()
              }
              onClick={() => void act(request.id, "approve", true)}
            >
              {localize(t, "Conditional approve", "조건부 승인")}
            </button>
            <button
              disabled={
                !canReview ||
                request.status !== "pending" ||
                busyRequestId === request.id ||
                (rejectReasons[request.id]?.trim().length ?? 0) < 3
              }
              onClick={() => void act(request.id, "reject")}
            >
              {t.approvals.reject}
            </button>
            <button
              className="primary"
              disabled={
                request.status !== "approved" ||
                busyRequestId === request.id ||
                (!canReview && request.requesterId !== currentUser?.id)
              }
              onClick={() => void act(request.id, "execute")}
            >
              {t.approvals.execute}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function Credentials({
  t,
  currentUser,
  credentials,
  requests,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser | null;
  credentials: IssuedCredential[];
  requests: AccessRequest[];
  onChanged: () => Promise<void>;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyCredentialId, setBusyCredentialId] = useState<string | null>(null);
  const canManageAll = currentUser?.roles.some((role) =>
    (["security-approver", "vault-admin", "app-owner"] as UserRole[]).includes(role)
  ) ?? false;

  async function revoke(id: string) {
    setActionError(null);
    setBusyCredentialId(id);
    try {
      await api(`/credentials/${id}/revoke`, { method: "POST" });
      await onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : localize(t, "Unable to revoke credential.", "Credential을 폐기하지 못했습니다."));
    } finally {
      setBusyCredentialId(null);
    }
  }
  return (
    <div className="stack">
      {actionError ? <div className="error">{actionError}</div> : null}
      {credentials.length === 0 ? <div className="empty">{t.credentials.empty}</div> : null}
      {credentials.map((credential) => {
        const request = requests.find((item) => item.id === credential.requestId);
        const canRevoke = canManageAll || request?.requesterId === currentUser?.id;
        return (
          <article className="card rowCard" key={credential.id}>
          <div>
            <h2>{credential.systemName}</h2>
            <p>
              {credential.requestType} / {credential.status} / {t.credentials.expires} {new Date(credential.expiresAt).toLocaleString()}
            </p>
            <code>{credential.maskedDisplayValue}</code>
            <LifecycleTimeline
              steps={credentialLifecycleSteps(
                t,
                request,
                credential
              )}
            />
            <details>
              <summary>{t.credentials.advanced}</summary>
              <pre>
                {JSON.stringify(
                  {
                    lease_id: credential.vaultLeaseId,
                    mount: credential.vaultMount,
                    role: credential.vaultRole,
                    metadata: credential.metadata
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
          <button
            disabled={!canRevoke || credential.status !== "active" || busyCredentialId === credential.id}
            onClick={() => void revoke(credential.id)}
          >
            {t.credentials.revoke}
          </button>
          </article>
        );
      })}
    </div>
  );
}

function Audit({ t, events }: { t: Copy; events: AuditEvent[] }) {
  const [actorFilter, setActorFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const filteredEvents = events.filter((event) => {
    const createdAt = new Date(event.createdAt).getTime();
    const fromOk = fromDate ? createdAt >= new Date(fromDate).getTime() : true;
    const toOk = toDate ? createdAt <= new Date(`${toDate}T23:59:59`).getTime() : true;
    return (
      fromOk &&
      toOk &&
      event.actorEmail.toLowerCase().includes(actorFilter.toLowerCase()) &&
      `${event.targetType}:${event.targetId}`.toLowerCase().includes(targetFilter.toLowerCase()) &&
      event.action.toLowerCase().includes(actionFilter.toLowerCase())
    );
  });
  const rows = filteredEvents.map((event) => [
    new Date(event.createdAt).toLocaleString(),
    event.actorEmail,
    event.action,
    `${event.targetType}:${event.targetId.slice(0, 8)}`,
    event.result
  ]);
  const columns = [t.table.time, t.table.actor, t.table.action, t.table.target, t.table.result];
  const csv = buildCsv(columns, rows);
  const report = buildAuditReport(t.audit.title, columns, rows);

  return (
    <div className="stack">
      <section className="filterPanel">
        <div>
          <h2>{t.audit.title}</h2>
          <p>{localize(t, "Filter workflow audit events and export the current report.", "워크플로우 감사 이벤트를 필터링하고 현재 리포트를 내보냅니다.")}</p>
        </div>
        <div className="filterGrid">
          <label>
            {localize(t, "From", "시작일")}
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            {localize(t, "To", "종료일")}
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label>
            {t.table.actor}
            <input value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} placeholder="user@example.com" />
          </label>
          <label>
            {t.table.target}
            <input value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)} placeholder="request / credential" />
          </label>
          <label>
            {t.table.action}
            <input value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} placeholder="approve / revoke" />
          </label>
        </div>
        <div className="actions">
          <a
            className="downloadLink"
            download="security-portal-audit.csv"
            href={dataDownloadHref("text/csv;charset=utf-8", csv)}
          >
            CSV
          </a>
          <a
            className="downloadLink primary"
            href={dataDownloadHref("text/html;charset=utf-8", report)}
            rel="noreferrer"
            target="_blank"
          >
            PDF / Print
          </a>
        </div>
      </section>
      <Table
        title={`${t.audit.title} (${filteredEvents.length})`}
        columns={[t.table.time, t.table.actor, t.table.action, t.table.target, t.table.result]}
        rows={rows}
        emptyLabel={t.table.noData}
      />
    </div>
  );
}

type PluginFilter = "all" | VaultPluginType | "partner" | "community" | "learning";
type PluginChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: "default" | "success" | "warning";
};
type FactoryAssistantResult = {
  reply: string;
  action: {
    type: "none" | "list" | "select" | "generate" | "generate-and-apply" | "apply" | "rollback";
    templateId?: string;
    filter?: PluginFilter;
  };
  provider: "ollama" | "rules";
  model?: string;
  fallbackReason?: "disabled" | "misconfigured" | "unavailable" | "invalid-response";
  latencyMs: number;
};
type FactoryAssistantHealth = {
  ok: boolean;
  provider: "ollama" | "rules";
  model?: string;
  modelAvailable?: boolean;
  detail: string;
};
type FactoryJobState = {
  kind: "generate" | "apply";
  label: string;
  status: "running" | "complete" | "failed";
  lines: string[];
};
type PluginFactoryHistoryItem = {
  id: string;
  action: "generated" | "applied" | "rollback-preview" | "blueprint-saved";
  pluginName: string;
  detail: string;
  createdAt: string;
  status: "success" | "warning";
};

const factoryStepDelayMs = 280;

function waitForFactoryMotion(ms = factoryStepDelayMs): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function PluginFactory({
  t,
  currentUser,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser | null;
  onChanged: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<VaultPluginTemplate[]>([]);
  const [filter, setFilter] = useState<PluginFilter>("all");
  const [selectedId, setSelectedId] = useState("");
  const [pluginName, setPluginName] = useState("");
  const [mountPath, setMountPath] = useState("");
  const [version, setVersion] = useState("v0.1.0");
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");
  const [artifactSha256, setArtifactSha256] = useState("");
  const [generated, setGenerated] = useState<VaultPluginGenerateResult | null>(null);
  const [applyResult, setApplyResult] = useState<VaultPluginApplyResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "chat" | "generate" | "apply" | null>("load");
  const [chatInput, setChatInput] = useState("");
  const welcomeMessage = factoryWelcomeMessage(t);
  const [chatMessages, setChatMessages] = useState<PluginChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: welcomeMessage
    }
  ]);
  const [factoryJob, setFactoryJob] = useState<FactoryJobState | null>(null);
  const [activeChatPrompt, setActiveChatPrompt] = useState<string | null>(null);
  const [assistantRuntime, setAssistantRuntime] = useState<
    Pick<FactoryAssistantResult, "provider" | "model" | "fallbackReason"> & { checked: boolean }
  >({ provider: "rules", checked: false });
  const [activeFilePath, setActiveFilePath] = useState("");
  const [savedBlueprints, setSavedBlueprints] = useState<string[]>([]);
  const [pluginHistory, setPluginHistory] = useState<PluginFactoryHistoryItem[]>([]);
  const [rollbackPreview, setRollbackPreview] = useState<string | null>(null);
  const canApply = currentUser?.roles.includes("vault-admin") ?? false;
  const scaffoldDownload = useMemo(() => {
    if (!generated) return null;
    const payload = JSON.stringify(
      {
        pluginName: generated.pluginName,
        mountPath: generated.mountPath,
        version: generated.version,
        command: generated.command,
        scaffoldSha256: generated.scaffoldSha256,
        files: generated.files
      },
      null,
      2
    );
    return {
      href: `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`,
      filename: `${generated.pluginName}-scaffold.json`
    };
  }, [generated]);

  useEffect(() => {
    let mounted = true;
    async function loadTemplates() {
      setBusy("load");
      try {
        const [response, assistantHealth] = await Promise.all([
          api<{ templates: VaultPluginTemplate[] }>("/plugin-factory/templates"),
          api<FactoryAssistantHealth>("/health/llm").catch(() => null)
        ]);
        if (!mounted) return;
        setTemplates(response.templates);
        setAssistantRuntime(
          assistantHealth
            ? { provider: assistantHealth.provider, model: assistantHealth.model, checked: true }
            : { provider: "rules", fallbackReason: "unavailable", checked: true }
        );
        const first = response.templates[0];
        if (first) {
          setSelectedId(first.id);
          hydratePluginForm(first);
        }
        setStatus(null);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Unable to load plugin templates");
      } finally {
        if (mounted) setBusy(null);
      }
    }
    void loadTemplates();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setChatMessages((messages) =>
      messages.length === 1 && messages[0]?.id === "welcome" ? [{ ...messages[0], content: welcomeMessage }] : messages
    );
  }, [welcomeMessage]);

  useEffect(() => {
    if (generated?.files.length && !generated.files.some((file) => file.path === activeFilePath)) {
      setActiveFilePath(generated.files[0]?.path ?? "");
    }
  }, [activeFilePath, generated]);

  const selectedTemplate = templates.find((template) => template.id === selectedId) ?? templates[0];
  const filteredTemplates = templates.filter((template) => templateMatchesFilter(template, filter));
  const counts: Record<PluginFilter, number> = {
    all: templates.length,
    auth: templates.filter((template) => template.pluginType === "auth").length,
    secret: templates.filter((template) => template.pluginType === "secret").length,
    database: templates.filter((template) => template.pluginType === "database").length,
    partner: templates.filter((template) => template.source === "partner").length,
    community: templates.filter((template) => template.source === "community").length,
    learning: templates.filter((template) => template.source === "learning").length
  };
  const chatExamples = [
    localize(t, "Create a GitHub App plugin", "깃허브 앱 플러그인 만들어줘"),
    localize(t, "Create a Sectigo PKI plugin", "섹티고 PKI 플러그인 만들어줘"),
    localize(t, "Create a ClickHouse database plugin", "클릭하우스 데이터베이스 플러그인 만들어줘"),
    localize(t, "Create an OpenAI plugin and apply it to Vault", "OpenAI 플러그인 만들고 Vault에 적용해줘"),
    localize(t, "List every plugin you can make", "만들 수 있는 플러그인 전부 알려줘"),
    localize(t, "Compare Sectigo and DigiCert", "Sectigo와 DigiCert를 비교해줘")
  ];
  const activeFile = generated?.files.find((file) => file.path === activeFilePath) ?? generated?.files[0];
  const capabilityCards = [
    ["1", localize(t, "Dry-run diff", "Dry-run 변경점"), generated ? generated.dryRun.changes.length : 0],
    ["2", localize(t, "AI spec interview", "AI 질문형 설계"), generated ? generated.blueprint.questions.length : 0],
    ["3", localize(t, "Code preview", "코드 미리보기"), generated ? generated.files.length : 0],
    ["4", localize(t, "Build/Test", "빌드/테스트"), generated ? generated.buildTest.steps.length : 0],
    ["5", localize(t, "Apply guardrails", "적용 안전장치"), generated ? generated.dryRun.approvals.length : 0],
    ["6", localize(t, "Blueprint save", "Blueprint 저장"), savedBlueprints.length],
    [
      "7",
      localize(t, "Marketplace", "마켓플레이스"),
      templates.filter((template) => template.source === "community" || template.source === "partner").length
    ],
    ["8", localize(t, "History", "생성 이력"), pluginHistory.length],
    ["9", localize(t, "Rollback", "롤백"), generated?.rollbackPlan.available ? 1 : 0],
    ["10", localize(t, "Security review", "보안 리뷰"), generated ? generated.securityReview.findings.length : 0]
  ];

  function hydratePluginForm(template: VaultPluginTemplate) {
    setPluginName(template.name);
    setMountPath(template.defaultMountPath);
    setVersion(template.defaultVersion);
    setCommand(template.defaultCommand);
    setDescription(template.description);
    setArtifactSha256("");
    setGenerated(null);
    setApplyResult(null);
  }

  function chooseTemplate(template: VaultPluginTemplate) {
    setSelectedId(template.id);
    hydratePluginForm(template);
    setStatus(null);
  }

  function changeFilter(nextFilter: PluginFilter) {
    setFilter(nextFilter);
    if (selectedTemplate && templateMatchesFilter(selectedTemplate, nextFilter)) return;
    const firstMatch = templates.find((template) => templateMatchesFilter(template, nextFilter));
    if (firstMatch) chooseTemplate(firstMatch);
  }

  function startFactoryJob(kind: FactoryJobState["kind"], label: string) {
    setFactoryJob({
      kind,
      label,
      status: "running",
      lines: []
    });
  }

  function appendFactoryJobLine(line: string) {
    setFactoryJob((job) => (job ? { ...job, lines: [...job.lines, line].slice(-10) } : job));
  }

  function finishFactoryJob(status: FactoryJobState["status"], line: string) {
    setFactoryJob((job) => (job ? { ...job, status, lines: [...job.lines, line].slice(-10) } : job));
  }

  function recordFactoryHistory(item: Omit<PluginFactoryHistoryItem, "id" | "createdAt">) {
    setPluginHistory((history) => [
      {
        ...item,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString()
      },
      ...history
    ].slice(0, 8));
  }

  function saveGeneratedBlueprint() {
    if (!generated) return;
    setSavedBlueprints((blueprints) => Array.from(new Set([generated.blueprint.name, ...blueprints])).slice(0, 6));
    recordFactoryHistory({
      action: "blueprint-saved",
      pluginName: generated.pluginName,
      detail: generated.blueprint.summary,
      status: "success"
    });
    addChatMessage(
      "assistant",
      localize(
        t,
        `I saved ${generated.blueprint.name} as a reusable Plugin Blueprint. You can use it as the standard starting point for the next similar request.`,
        `${generated.blueprint.name} Blueprint를 저장했습니다. 다음에 비슷한 플러그인을 만들 때 표준 시작점으로 사용할 수 있어요.`
      ),
      "success"
    );
  }

  async function previewRollback() {
    if (!generated) return;
    setRollbackPreview(generated.rollbackPlan.summary);
    startFactoryJob("apply", localize(t, `Rollback preview for ${generated.pluginName}`, `${generated.pluginName} 롤백 미리보기`));
    await playFactoryJobLines(generated.rollbackPlan.commands);
    finishFactoryJob("complete", localize(t, "✓ rollback commands prepared", "✓ 롤백 명령 준비 완료"));
    recordFactoryHistory({
      action: "rollback-preview",
      pluginName: generated.pluginName,
      detail: generated.rollbackPlan.summary,
      status: "warning"
    });
    addChatMessage(
      "assistant",
      localize(
        t,
        `I prepared a rollback preview for ${generated.pluginName}. It is not executed automatically; review the disable and deregister commands before using them.`,
        `${generated.pluginName} 롤백 미리보기를 준비했습니다. 자동 실행은 하지 않았고, disable 및 deregister 명령을 먼저 검토할 수 있게 보여드립니다.`
      ),
      "warning"
    );
  }

  async function playFactoryJobLines(lines: string[]) {
    for (const line of lines) {
      await waitForFactoryMotion();
      appendFactoryJobLine(line);
    }
  }

  async function generateTemplateScaffold(
    template: VaultPluginTemplate,
    input: {
      pluginName: string;
      mountPath: string;
      version: string;
      command: string;
      description: string;
    },
    successMessage = localize(t, "Plugin scaffold generated.", "플러그인 스캐폴드가 생성되었습니다.")
  ): Promise<VaultPluginGenerateResult | null> {
    startFactoryJob("generate", localize(t, `Generating ${input.pluginName}`, `${input.pluginName} 생성 중`));
    setBusy("generate");
    setStatus(null);
    setApplyResult(null);
    try {
      await playFactoryJobLines([
      `$ factory select ${template.id}`,
      `$ mkdir -p cmd/${input.pluginName} internal/plugin vault`,
      `$ render go.mod README.md Makefile vault/apply.hcl`
      ]);
      appendFactoryJobLine(`$ call POST /plugin-factory/generate`);
      await waitForFactoryMotion(220);
      const response = await api<{ generated: VaultPluginGenerateResult }>("/plugin-factory/generate", {
        method: "POST",
        body: JSON.stringify({
          templateId: template.id,
          pluginName: input.pluginName,
          mountPath: input.mountPath,
          version: input.version,
          command: input.command,
          description: input.description
        })
      });
      setGenerated(response.generated);
      setSelectedId(template.id);
      setPluginName(response.generated.pluginName);
      setMountPath(response.generated.mountPath);
      setVersion(response.generated.version);
      setCommand(response.generated.command);
      setDescription(response.generated.description);
      setArtifactSha256(response.generated.scaffoldSha256);
      setActiveFilePath(response.generated.files[0]?.path ?? "");
      setRollbackPreview(null);
      setStatus(successMessage);
      await onChanged();
      await waitForFactoryMotion(220);
      finishFactoryJob(
        "complete",
        localize(
          t,
          `✓ generated ${response.generated.files.length} files · sha ${shortId(response.generated.scaffoldSha256)}`,
          `✓ ${response.generated.files.length}개 파일 생성 · sha ${shortId(response.generated.scaffoldSha256)}`
        )
      );
      recordFactoryHistory({
        action: "generated",
        pluginName: response.generated.pluginName,
        detail: `${response.generated.files.length} files · ${response.generated.mountPath}/ · ${shortId(response.generated.scaffoldSha256)}`,
        status: "success"
      });
      return response.generated;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to generate plugin scaffold");
      finishFactoryJob("failed", `✕ ${err instanceof Error ? err.message : "generation failed"}`);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function generatePlugin() {
    if (!selectedTemplate) return;
    await generateTemplateScaffold(selectedTemplate, {
      pluginName,
      mountPath,
      version,
      command,
      description
    });
  }

  async function applyGeneratedPlugin(target: VaultPluginGenerateResult): Promise<VaultPluginApplyResult | null> {
    const effectiveSha256 = generated?.id === target.id ? artifactSha256 || target.scaffoldSha256 : target.scaffoldSha256;
    startFactoryJob("apply", localize(t, `Applying ${target.pluginName}`, `${target.pluginName} Vault 적용 중`));
    setBusy("apply");
    setStatus(null);
    try {
      await playFactoryJobLines([
      `$ vault health`,
      `$ vault plugin register -command=${target.command} -sha256=${shortId(effectiveSha256)}`,
      target.template.pluginType === "auth"
        ? `$ vault auth enable -path=${target.mountPath} ${target.pluginName}`
        : `$ vault secrets enable -path=${target.mountPath} ${target.pluginName}`
      ]);
      appendFactoryJobLine(`$ call POST /plugin-factory/apply`);
      await waitForFactoryMotion(220);
      const response = await api<{ result: VaultPluginApplyResult }>("/plugin-factory/apply", {
        method: "POST",
        body: JSON.stringify({
          pluginType: target.template.pluginType,
          pluginName: target.pluginName,
          mountPath: target.mountPath,
          version: target.version,
          command: target.command,
          artifactSha256: effectiveSha256,
          description: target.description
        })
      });
      setApplyResult(response.result);
      setStatus(localize(t, "Vault apply completed.", "Vault 적용이 완료되었습니다."));
      await onChanged();
      await waitForFactoryMotion(220);
      finishFactoryJob(
        "complete",
        localize(
          t,
          `✓ applied ${response.result.pluginName} at ${response.result.mountPath}/ (${response.result.mode})`,
          `✓ ${response.result.pluginName} 적용 완료 · ${response.result.mountPath}/ (${response.result.mode})`
        )
      );
      recordFactoryHistory({
        action: "applied",
        pluginName: response.result.pluginName,
        detail: `${response.result.mountPath}/ · ${response.result.mode}`,
        status: response.result.applied ? "success" : "warning"
      });
      return response.result;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to apply plugin");
      finishFactoryJob("failed", `✕ ${err instanceof Error ? err.message : "apply failed"}`);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function applyPlugin() {
    if (generated) {
      await applyGeneratedPlugin(generated);
    }
  }

  function addChatMessage(role: PluginChatMessage["role"], content: string, tone: PluginChatMessage["tone"] = "default") {
    setChatMessages((messages) => [
      ...messages,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        content,
        tone
      }
    ]);
  }

  async function submitChatPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setChatInput("");
    setActiveChatPrompt(trimmed);
    window.setTimeout(() => {
      setActiveChatPrompt((activePrompt) => (activePrompt === trimmed ? null : activePrompt));
    }, 760);
    addChatMessage("user", trimmed);
    await runFactoryChat(trimmed);
  }

  async function runFactoryChat(prompt: string) {
    if (busy !== null) {
      addChatMessage("assistant", localize(t, "A factory job is already running.", "이미 Factory 작업이 실행 중입니다."), "warning");
      return;
    }
    setBusy("chat");
    try {
      const response = await api<{ result: FactoryAssistantResult }>("/plugin-factory/chat", {
        method: "POST",
        body: JSON.stringify({
          locale: t === copy.ko ? "ko" : "en",
          messages: [
            ...chatMessages.slice(-11).map((message) => ({ role: message.role, content: message.content })),
            { role: "user", content: prompt }
          ],
          selectedTemplateId: selectedTemplate?.id,
          generatedPluginName: generated?.pluginName
        })
      });
      setAssistantRuntime({
        provider: response.result.provider,
        model: response.result.model,
        fallbackReason: response.result.fallbackReason,
        checked: true
      });
      setBusy(null);
      await executeFactoryAssistantResult(response.result);
    } catch {
      setBusy(null);
      setAssistantRuntime({ provider: "rules", fallbackReason: "unavailable", checked: true });
      await runFactoryChatFallback(prompt);
    }
  }

  async function executeFactoryAssistantResult(result: FactoryAssistantResult) {
    addChatMessage("assistant", result.reply);
    if (result.action.type === "none" || result.action.type === "list") return;

    if (result.action.type === "rollback") {
      if (!generated) {
        addChatMessage(
          "assistant",
          localize(t, "Generate a plugin first so I can prepare a rollback.", "롤백을 준비하려면 먼저 플러그인을 생성해주세요."),
          "warning"
        );
        return;
      }
      await previewRollback();
      return;
    }

    if (result.action.type === "apply") {
      if (!generated) {
        addChatMessage("assistant", localize(t, "Generate a plugin first, then ask me to apply it.", "먼저 플러그인을 생성한 뒤 적용을 요청하세요."), "warning");
        return;
      }
      if (!canApply) {
        addChatMessage("assistant", localize(t, "Vault admin role is required to apply it.", "Vault 적용에는 관리자 권한이 필요합니다."), "warning");
        return;
      }
      const apply = await applyGeneratedPlugin(generated);
      addChatMessage(
        "assistant",
        apply
          ? factoryAppliedMessage(apply, t)
          : localize(t, "Apply failed. Check the status banner.", "적용에 실패했습니다. 상태 메시지를 확인하세요."),
        apply ? "success" : "warning"
      );
      return;
    }

    const template = templates.find((item) => item.id === result.action.templateId);
    if (!template) {
      addChatMessage("assistant", localize(t, "The requested template is not in the verified catalog.", "요청한 템플릿이 검증된 카탈로그에 없습니다."), "warning");
      return;
    }

    chooseTemplate(template);
    setFilter(filterForTemplate(template));
    if (result.action.type === "select") return;

    const applyAfterGenerate = result.action.type === "generate-and-apply";
    const generatedResult = await generateTemplateScaffold(
      template,
      {
        pluginName: template.name,
        mountPath: template.defaultMountPath,
        version: template.defaultVersion,
        command: template.defaultCommand,
        description: template.description
      },
      localize(t, "Factory chat generated a plugin scaffold.", "Factory 채팅으로 플러그인 스캐폴드를 생성했습니다.")
    );
    if (!generatedResult) {
      addChatMessage("assistant", localize(t, "Generation failed. Check the status banner.", "생성에 실패했습니다. 상태 메시지를 확인하세요."), "warning");
      return;
    }

    addChatMessage("assistant", factoryGeneratedMessage(generatedResult, applyAfterGenerate, t), "success");
    if (!applyAfterGenerate) return;
    if (!canApply) {
      addChatMessage("assistant", localize(t, "Vault admin role is required to apply it.", "Vault 적용에는 관리자 권한이 필요합니다."), "warning");
      return;
    }
    const apply = await applyGeneratedPlugin(generatedResult);
    addChatMessage(
      "assistant",
      apply
        ? factoryAppliedMessage(apply, t)
        : localize(t, "Apply failed. Check the status banner.", "적용에 실패했습니다. 상태 메시지를 확인하세요."),
      apply ? "success" : "warning"
    );
  }

  async function runFactoryChatFallback(prompt: string) {
    const normalized = normalizeFactoryPrompt(prompt);
    const wantsCreate = /만들|생성|제작|create|make|generate|scaffold/.test(normalized);
    const wantsApply = /적용|등록|활성|배포|apply|register|enable/.test(normalized);
    const wantsList = /전부|모든|목록|뭐|어떤|보여|알려|list|available|catalog|what plugins|which plugins|can you make/.test(normalized);
    const wantsRollback = /롤백|되돌|disable|deregister|rollback|undo/.test(normalized);
    const template = findTemplateFromPrompt(prompt, templates);
    const requestedFilter: PluginFilter = /데이터베이스|database|db\b/.test(normalized)
      ? "database"
      : /인증|auth/.test(normalized)
        ? "auth"
        : /시크릿|secret/.test(normalized)
          ? "secret"
          : "all";
    const result: FactoryAssistantResult = {
      provider: "rules",
      fallbackReason: "unavailable",
      latencyMs: 0,
      reply: localize(t, "The safe local fallback is active.", "안전한 로컬 fallback으로 처리하고 있습니다."),
      action: { type: "none" }
    };

    if (wantsList) {
      result.reply = pluginCatalogSummary(templates, t, requestedFilter);
      result.action = { type: "list", filter: requestedFilter };
    } else if (wantsRollback) {
      result.reply = localize(t, "I will prepare a rollback preview first.", "먼저 롤백 미리보기를 준비하겠습니다.");
      result.action = { type: "rollback" };
    } else if (wantsCreate && template) {
      result.reply = factoryStartMessage(template, wantsApply, t);
      result.action = { type: wantsApply ? "generate-and-apply" : "generate", templateId: template.id };
    } else if (wantsApply) {
      result.reply = localize(t, "I will run the guarded Vault apply flow.", "검증과 승인 절차를 거쳐 Vault 적용을 진행하겠습니다.");
      result.action = { type: "apply" };
    } else if (template) {
      result.reply = localize(t, `I selected ${template.displayName}.`, `${template.displayName} 템플릿을 선택했습니다.`);
      result.action = { type: "select", templateId: template.id };
    } else {
      result.reply = localize(
        t,
        "The AI endpoint is unavailable. Catalog, generation, apply, and rollback commands are still supported.",
        "AI 엔드포인트에 연결할 수 없습니다. 카탈로그 조회·생성·적용·롤백 명령은 계속 사용할 수 있습니다."
      );
    }
    await executeFactoryAssistantResult(result);
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitChatPrompt(chatInput);
  }

  async function generateSelectedTemplateFromChat() {
    if (!selectedTemplate) return;
    setActiveChatPrompt("selected-template-generate");
    window.setTimeout(() => {
      setActiveChatPrompt((activePrompt) => (activePrompt === "selected-template-generate" ? null : activePrompt));
    }, 760);
    addChatMessage(
      "user",
      localize(t, `Generate selected template: ${selectedTemplate.name}`, `선택 템플릿 생성: ${selectedTemplate.name}`)
    );
    addChatMessage("assistant", factoryStartMessage(selectedTemplate, false, t));
    const generatedResult = await generateTemplateScaffold(
      selectedTemplate,
      {
        pluginName,
        mountPath,
        version,
        command,
        description
      },
      localize(t, "Factory generated the selected template.", "Factory가 선택한 템플릿을 생성했습니다.")
    );
    if (generatedResult) {
      addChatMessage("assistant", factoryGeneratedMessage(generatedResult, false, t), "success");
    }
  }

  return (
    <div className="stack pluginFactory">
      <section className="pluginHero">
        <div>
          <span className="eyebrow">{localize(t, "Plugin workspace", "플러그인 작업 공간")}</span>
          <p>
            {localize(
              t,
              "Create a custom Vault plugin scaffold, review the generated source, then register and enable it through the Vault adapter.",
              "Vault 커스텀 플러그인 스캐폴드를 만들고, 생성된 소스와 적용 계획을 확인한 뒤 Vault 어댑터로 등록 및 활성화합니다."
            )}
          </p>
        </div>
        <div className="pluginHeroActions">
          <button className="primary" type="button" onClick={() => void generatePlugin()} disabled={!selectedTemplate || busy !== null}>
            <Sparkles aria-hidden="true" size={17} />
            {busy === "generate" ? localize(t, "Generating...", "생성 중...") : localize(t, "Create custom plugin", "커스텀 플러그인 생성")}
          </button>
          <button
            className="primaryGhost"
            type="button"
            onClick={() => void applyPlugin()}
            disabled={!generated || !canApply || busy !== null || !artifactSha256}
            title={canApply ? undefined : localize(t, "Vault admin role required", "Vault 관리자 권한이 필요합니다.")}
          >
            <Upload aria-hidden="true" size={17} />
            {busy === "apply" ? localize(t, "Applying...", "적용 중...") : localize(t, "Apply to Vault", "Vault에 적용")}
          </button>
        </div>
      </section>

      <section className="workflowStrip" aria-label="Plugin workflow">
        {[
          [localize(t, "Generate", "생성"), localize(t, "Go scaffold, policy, Makefile", "Go 스캐폴드, 정책, Makefile")],
          [localize(t, "Build/Test", "빌드/테스트"), localize(t, "go test, go build, SHA256", "go test, go build, SHA256")],
          [localize(t, "Register/Enable", "등록/활성화"), localize(t, "Catalog, mount, smoke test", "Catalog, Mount, Smoke test")]
        ].map(([label, detail], index) => (
          <div key={label} className="workflowStep">
            <span>{index + 1}</span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </section>

      <section className={`factoryChatPanel ${busy === "chat" || busy === "generate" || busy === "apply" ? "running" : ""}`}>
        <div className="panelHeader">
          <div>
            <h2>{localize(t, "Factory chat", "Factory 채팅")}</h2>
            <p>{localize(t, "Ask for a plugin, generate it, then apply it to Vault.", "플러그인을 요청하고 생성한 뒤 Vault에 적용합니다.")}</p>
            <div
              className={`assistantRuntime ${assistantRuntime.provider} ${assistantRuntime.fallbackReason ?? ""}`}
              title={
                assistantRuntime.provider === "ollama"
                  ? `Ollama · ${assistantRuntime.model ?? "local model"}`
                  : undefined
              }
            >
              <span aria-hidden="true" />
              {!assistantRuntime.checked
                ? localize(t, "Checking AI connection", "AI 연결 확인 중")
                : assistantRuntime.provider === "ollama"
                  ? localize(t, "AI assistant online", "AI 어시스턴트 연결됨")
                  : assistantRuntime.fallbackReason === "unavailable"
                    ? localize(t, "Rules fallback · AI unavailable", "규칙 fallback · AI 연결 안 됨")
                    : localize(t, "Rules fallback", "규칙 fallback")}
            </div>
          </div>
          <div className="chatQuickActions">
            <button
              type="button"
              className={activeChatPrompt === "selected-template-generate" ? "launching" : undefined}
              onClick={() => void generateSelectedTemplateFromChat()}
              disabled={!selectedTemplate || busy !== null}
            >
              {localize(t, "Generate selected template", "선택 템플릿 생성")}
            </button>
            <button
              type="button"
              className={activeChatPrompt === localize(t, "Apply it to Vault", "Vault에 적용해줘") ? "launching" : undefined}
              onClick={() => void submitChatPrompt(localize(t, "Apply it to Vault", "Vault에 적용해줘"))}
              disabled={busy !== null || !generated || !canApply}
              title={canApply ? undefined : localize(t, "Vault admin role required", "Vault 관리자 권한이 필요합니다.")}
            >
              {localize(t, "Apply to Vault", "Vault 적용")}
            </button>
          </div>
        </div>
        <div className="chatExamples" aria-label={localize(t, "Example prompts", "예시 프롬프트")}>
          <span>{localize(t, "Examples", "예시")}</span>
          {chatExamples.map((example) => (
            <button
              key={example}
              type="button"
              className={activeChatPrompt === example ? "launching" : undefined}
              onClick={() => void submitChatPrompt(example)}
              disabled={busy !== null}
            >
              {example}
            </button>
          ))}
        </div>
        {factoryJob ? (
          <div className={`factoryCodeConsole ${factoryJob.status}`} aria-live="polite">
            <div>
              <strong>{factoryJob.label}</strong>
              <span>{factoryJob.status}</span>
            </div>
            <pre>
              {factoryJob.lines.map((line, index) => (
                <code key={`${index}-${line}`}>{line}</code>
              ))}
              {factoryJob.status === "running" ? <code className="consoleCursor">$ _</code> : null}
            </pre>
          </div>
        ) : null}
        <div className="chatMessages" aria-live="polite">
          {chatMessages.map((message) => (
            <div key={message.id} className={`chatBubble ${message.role} ${message.tone ?? "default"}`}>
              <span>{message.role === "user" ? localize(t, "You", "나") : "Factory"}</span>
              <p>{message.content}</p>
            </div>
          ))}
          {busy === "chat" ? (
            <div className="chatBubble assistant thinking">
              <span>Factory</span>
              <p>
                {localize(t, "Thinking with the local model", "로컬 모델이 답변을 구성하고 있습니다")}
                <i aria-hidden="true">...</i>
              </p>
            </div>
          ) : null}
        </div>
        <form className="chatComposer" onSubmit={handleChatSubmit}>
          <input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={localize(t, "Create a GitHub App plugin", "깃허브 앱 플러그인 만들어줘")}
            disabled={busy !== null}
          />
          <button
            aria-label={localize(t, "Send message", "메시지 전송")}
            className="chatSendButton iconButton"
            title={localize(t, "Send message", "메시지 전송")}
            type="submit"
            disabled={busy !== null || !chatInput.trim()}
          >
            <Send aria-hidden="true" size={18} />
          </button>
        </form>
      </section>

      {status ? <div className={status.includes("Unable") || status.includes("required") ? "error" : "success"}>{status}</div> : null}

      <div className="pluginWorkspace">
        <section className="pluginCatalogPanel">
          <div className="panelHeader">
            <div>
              <h2>{localize(t, "Plugin catalog", "플러그인 카탈로그")}</h2>
              <p>
                {localize(
                  t,
                  `${templates.length} templates including official, partner, learning, and community entries.`,
                  `공식, 파트너, 학습용, 커뮤니티를 포함한 ${templates.length}개 템플릿`
                )}
              </p>
            </div>
          </div>
          <div className="segmentedControl" role="tablist" aria-label="Plugin filters">
            {(["all", "auth", "secret", "database", "partner", "community", "learning"] as PluginFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                onClick={() => changeFilter(item)}
              >
                {filterLabel(item, t)} <span>{counts[item]}</span>
              </button>
            ))}
          </div>

          <div className="pluginList">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`pluginRow ${selectedTemplate?.id === template.id ? "selected" : ""}`}
                onClick={() => chooseTemplate(template)}
              >
                <div>
                  <strong>{template.displayName}</strong>
                  <small>{template.description}</small>
                </div>
                <div className="pluginBadges">
                  <span>{pluginTypeLabel(template.pluginType, t)}</span>
                  <span>{sourceLabel(template.source, t)}</span>
                  <span>{template.marketplace.maturity}</span>
                  {template.popularity?.rank ? <span>Top {template.popularity.rank}</span> : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="builderPanel">
          {selectedTemplate ? (
            <>
              <div className="builderHeader">
                <div>
                  <h2>{selectedTemplate.displayName}</h2>
                  <p>{selectedTemplate.description}</p>
                </div>
                <a href={selectedTemplate.sourceUrl} target="_blank" rel="noreferrer">
                  {selectedTemplate.repository}
                </a>
              </div>

              <div className="templateMeta">
                <div className="metaTile">
                  <span>{localize(t, "Type", "유형")}</span>
                  <strong>{pluginTypeLabel(selectedTemplate.pluginType, t)}</strong>
                </div>
                <div className="metaTile">
                  <span>{localize(t, "Source", "출처")}</span>
                  <strong>{sourceLabel(selectedTemplate.source, t)}</strong>
                </div>
                <div className="metaTile">
                  <span>{localize(t, "Target", "대상")}</span>
                  <strong>{selectedTemplate.integrationTarget}</strong>
                </div>
                <div className="metaTile">
                  <span>{localize(t, "Popularity", "인지도")}</span>
                  <strong>{selectedTemplate.popularity ? `${selectedTemplate.popularity.stars} stars` : "-"}</strong>
                </div>
              </div>

              <div className="builderGrid">
                <label>
                  <span>{localize(t, "Plugin name", "플러그인 이름")}</span>
                  <input value={pluginName} onChange={(event) => setPluginName(event.target.value)} />
                </label>
                <label>
                  <span>{localize(t, "Mount path", "Mount 경로")}</span>
                  <input value={mountPath} onChange={(event) => setMountPath(event.target.value)} />
                </label>
                <label>
                  <span>{localize(t, "Version", "버전")}</span>
                  <input value={version} onChange={(event) => setVersion(event.target.value)} />
                </label>
                <label>
                  <span>{localize(t, "Command", "실행 명령")}</span>
                  <input value={command} onChange={(event) => setCommand(event.target.value)} />
                </label>
              </div>

              <label className="wideField">
                <span>{localize(t, "Description", "설명")}</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
              </label>

              <label className="wideField">
                <span>{localize(t, "Binary SHA256", "바이너리 SHA256")}</span>
                <input value={artifactSha256} onChange={(event) => setArtifactSha256(event.target.value)} />
                <small>
                  {localize(
                    t,
                    "Generated scaffold SHA is prefilled for mock apply; replace it with the compiled binary SHA for real Vault.",
                    "Mock 적용에는 생성 스캐폴드 SHA가 자동 입력됩니다. 실제 Vault에는 컴파일된 바이너리 SHA로 교체하세요."
                  )}
                </small>
              </label>

              <div className="guardrailList">
                {selectedTemplate.guardrails.map((guardrail) => (
                  <span key={guardrail}>{guardrail}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty compact">{busy === "load" ? t.loading : t.table.noData}</div>
          )}
        </section>
      </div>

      <section className="tablePanel factoryOpsPanel">
        <div className="panelHeader">
          <div>
            <h2>{localize(t, "Factory operations cockpit", "Factory 운영 패널")}</h2>
            <p>
              {localize(
                t,
                "Dry-run, guided design, code review, build/test, safety, blueprints, marketplace, history, rollback, and security review are tracked together.",
                "Dry-run, 질문형 설계, 코드 리뷰, 빌드/테스트, 안전장치, Blueprint, 마켓플레이스, 이력, 롤백, 보안 리뷰를 한 화면에서 추적합니다."
              )}
            </p>
          </div>
          <button type="button" onClick={saveGeneratedBlueprint} disabled={!generated}>
            {localize(t, "Save blueprint", "Blueprint 저장")}
          </button>
        </div>
        <div className="capabilityGrid">
          {capabilityCards.map(([index, label, value]) => (
            <div key={index} className="capabilityCard">
              <span>{index}</span>
              <strong>{label}</strong>
              <small>{value}</small>
            </div>
          ))}
        </div>
        <div className="factoryOpsGrid">
          <section className="opsCard">
            <h3>{localize(t, "AI spec interview", "AI 질문형 설계")}</h3>
            {generated ? (
              <div className="questionList">
                {generated.blueprint.questions.map((question) => (
                  <label key={question.id}>
                    <span>
                      {question.question}
                      {question.required ? " *" : ""}
                    </span>
                    <input value={question.answer} readOnly />
                  </label>
                ))}
              </div>
            ) : (
              <div className="empty compact">{localize(t, "Generate a plugin to create a guided blueprint.", "플러그인을 생성하면 질문형 Blueprint가 만들어집니다.")}</div>
            )}
            {savedBlueprints.length ? (
              <div className="savedBlueprints">
                {savedBlueprints.map((blueprint) => (
                  <span key={blueprint}>{blueprint}</span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="opsCard">
            <h3>{localize(t, "Template marketplace", "템플릿 마켓플레이스")}</h3>
            {selectedTemplate ? (
              <>
                <div className="marketplaceHeader">
                  <strong>{selectedTemplate.marketplace.maturity}</strong>
                  <span>{selectedTemplate.marketplace.riskLevel}</span>
                </div>
                <p>{selectedTemplate.marketplace.recommendedUse}</p>
                <div className="pluginBadges">
                  {selectedTemplate.marketplace.badges.map((badge) => (
                    <span key={badge}>{badge}</span>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty compact">{t.table.noData}</div>
            )}
          </section>

          <section className="opsCard">
            <h3>{localize(t, "Generated plugin history", "생성 플러그인 이력")}</h3>
            {pluginHistory.length ? (
              <div className="historyList">
                {pluginHistory.map((item) => (
                  <div key={item.id}>
                    <span className={item.status}>{item.action}</span>
                    <div>
                      <strong>{item.pluginName}</strong>
                      <small>{item.detail}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty compact">{localize(t, "No Factory history in this session yet.", "아직 이 세션의 Factory 이력이 없습니다.")}</div>
            )}
          </section>

          <section className="opsCard">
            <h3>{localize(t, "Security review", "보안 리뷰")}</h3>
            {generated ? (
              <>
                <div className="securityScore">
                  <strong>{generated.securityReview.score}</strong>
                  <span>{generated.securityReview.posture}</span>
                </div>
                <div className="findingList">
                  {generated.securityReview.findings.map((finding) => (
                    <div key={`${finding.severity}-${finding.title}`}>
                      <span className={finding.severity}>{finding.severity}</span>
                      <div>
                        <strong>{finding.title}</strong>
                        <small>{finding.detail}</small>
                        <small>{finding.remediation}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty compact">{localize(t, "Generate a plugin to run the Factory security review.", "플러그인을 생성하면 Factory 보안 리뷰가 실행됩니다.")}</div>
            )}
          </section>
        </div>
      </section>

      <div className="pluginOutputGrid">
        <section className="tablePanel commandPanel generatedFilesPanel">
          <div className="panelHeader">
            <div>
              <h2>{localize(t, "Generated files", "생성 파일")}</h2>
              <p>{generated ? `${generated.files.length} files - ${shortId(generated.scaffoldSha256)}` : "-"}</p>
            </div>
            {scaffoldDownload ? (
              <a className="downloadLink" href={scaffoldDownload.href} download={scaffoldDownload.filename}>
                {localize(t, "Download scaffold", "스캐폴드 다운로드")}
              </a>
            ) : (
              <button type="button" disabled>
                {localize(t, "Download scaffold", "스캐폴드 다운로드")}
              </button>
            )}
          </div>
          {generated ? (
            <div className="generatedFileWorkspace">
              <div
                className="fileTabs"
                role="tablist"
                aria-label={localize(t, "Generated plugin files", "생성된 플러그인 파일")}
              >
                {generated.files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    role="tab"
                    aria-controls="generated-file-preview"
                    aria-selected={activeFile?.path === file.path}
                    className={activeFile?.path === file.path ? "active" : ""}
                    onClick={() => setActiveFilePath(file.path)}
                    title={file.path}
                  >
                    <span>{file.path}</span>
                    <small>{file.language}</small>
                  </button>
                ))}
              </div>
              {activeFile ? (
                <div
                  className="codePreview"
                  id="generated-file-preview"
                  role="tabpanel"
                  aria-label={activeFile.path}
                >
                  <div>
                    <strong>{activeFile.path}</strong>
                    <span>{activeFile.language}</span>
                  </div>
                  <pre>{activeFile.content}</pre>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty compact">{localize(t, "No generated scaffold yet.", "아직 생성된 스캐폴드가 없습니다.")}</div>
          )}
        </section>

        <section className="tablePanel commandPanel">
          <h2>{localize(t, "Build and apply plan", "빌드 및 적용 계획")}</h2>
          {generated ? (
            <>
              <div className="commandList">
                {generated.commands.map((commandLine) => (
                  <code key={commandLine}>{commandLine}</code>
                ))}
              </div>
              <div className="buildTestPanel">
                <div className="resultBanner compactBanner">
                  <strong>{localize(t, "Build/Test simulation", "빌드/테스트 시뮬레이션")}</strong>
                  <span>{generated.buildTest.status}</span>
                </div>
                {generated.buildTest.steps.map((step) => (
                  <div className="applyStep" key={`${step.label}-${step.command}`}>
                    <span className={step.status === "pass" ? "success" : step.status === "warn" ? "planned" : step.status}>
                      {step.status}
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.command}</small>
                      <small>
                        {step.durationMs ? `${step.durationMs}ms - ` : ""}
                        {step.detail}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              <div className="applyTimeline">
                {generated.applyPlan.map((step, index) => (
                  <div key={step}>
                    <span>{index + 1}</span>
                    <p>{step}</p>
                  </div>
                ))}
              </div>
              {generated.warnings.map((warning) => (
                <div className="warningLine" key={warning}>
                  {warning}
                </div>
              ))}
            </>
          ) : (
            <div className="empty compact">{localize(t, "Generate a plugin to see commands.", "플러그인을 생성하면 명령을 확인할 수 있습니다.")}</div>
          )}
        </section>

        <section className="tablePanel commandPanel">
          <h2>{localize(t, "Apply result", "적용 결과")}</h2>
          {generated ? (
            <div className="dryRunPanel">
              <div className="resultBanner compactBanner">
                <strong>{localize(t, "Dry-run apply diff", "Dry-run 적용 변경점")}</strong>
                <span>{generated.dryRun.mode}</span>
              </div>
              <p>{generated.dryRun.summary}</p>
              {generated.dryRun.changes.map((change) => (
                <div className="diffRow" key={`${change.action}-${change.target}`}>
                  <span className={change.risk}>{change.risk}</span>
                  <div>
                    <strong>
                      {change.action} {change.target}
                    </strong>
                    <small>
                      {change.before} → {change.after}
                    </small>
                  </div>
                </div>
              ))}
              <div className="safetyList">
                {generated.dryRun.collisions.concat(generated.dryRun.approvals).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <button type="button" onClick={() => void previewRollback()}>
                {localize(t, "Preview rollback", "롤백 미리보기")}
              </button>
              {rollbackPreview ? <div className="warningLine">{rollbackPreview}</div> : null}
            </div>
          ) : null}
          {applyResult ? (
            <div className="applyResult">
              <div className="resultBanner">
                <strong>{applyResult.applied ? localize(t, "Applied", "적용됨") : localize(t, "Pending", "대기")}</strong>
                <span>{applyResult.mode}</span>
              </div>
              {applyResult.steps.map((step) => (
                <div className="applyStep" key={`${step.label}-${step.detail}`}>
                  <span className={step.status}>{step.status}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty compact">
              {canApply
                ? localize(t, "No Vault apply result yet.", "아직 Vault 적용 결과가 없습니다.")
                : localize(t, "Vault admin role required for apply.", "적용에는 Vault 관리자 권한이 필요합니다.")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function UserManagement({
  t,
  currentUser,
  systems,
  auditEvents,
  onChanged
}: {
  t: Copy;
  currentUser: PortalUser | null;
  systems: SystemSummary[];
  auditEvents: AuditEvent[];
  onChanged: () => Promise<void>;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [draftRoles, setDraftRoles] = useState<UserRole[]>([]);
  const [draftGroups, setDraftGroups] = useState<string[]>([]);
  const [draftStatus, setDraftStatus] = useState<UserStatus>("active");
  const [draftMfaEnabled, setDraftMfaEnabled] = useState(false);
  const [draftPasswordResetRequired, setDraftPasswordResetRequired] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [userAction, setUserAction] = useState<"save" | "reset" | null>(null);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0];
  const availableGroups = useMemo(
    () =>
      Array.from(
        new Set([
          ...users.flatMap((user) => user.groups),
          ...systems.map((system) => system.ownerGroup),
          "security-approvers",
          "platform-admins",
          "audit"
        ])
      ).sort(),
    [systems, users]
  );
  const filteredUsers = users.filter((user) => {
    const search = `${user.email} ${user.displayName} ${user.roles.join(" ")} ${user.groups.join(" ")}`.toLowerCase();
    return search.includes(query.toLowerCase()) && (statusFilter === "all" || user.status === statusFilter);
  });
  const userAuditEvents = selectedUser
    ? auditEvents
        .filter((event) => event.targetId === selectedUser.id || event.actorEmail === selectedUser.email)
        .slice(0, 5)
    : [];
  const canEdit = canManageUsers && Boolean(selectedUser);

  async function loadUsers() {
    setLoadingUsers(true);
    setError(null);
    try {
      const response = await api<{
        users: ManagedUser[];
        capabilities: { canManageUsers: boolean; passwordMode: string };
      }>("/admin/users");
      setUsers(response.users);
      setCanManageUsers(response.capabilities.canManageUsers);
      setSelectedUserId((current) => current || response.users[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setDraftRoles(selectedUser.roles);
    setDraftGroups(selectedUser.groups);
    setDraftStatus(selectedUser.status);
    setDraftMfaEnabled(selectedUser.mfaEnabled);
    setDraftPasswordResetRequired(selectedUser.passwordResetRequired);
    setTemporaryPassword("");
    setRevealPassword(false);
    setMessage("");
  }, [selectedUser?.id]);

  async function saveAccess() {
    if (!selectedUser) return;
    setError(null);
    setUserAction("save");
    try {
      const response = await api<{ user: ManagedUser }>(`/admin/users/${selectedUser.id}/access`, {
        method: "PATCH",
        body: JSON.stringify({
          roles: draftRoles,
          groups: draftGroups,
          status: draftStatus,
          mfaEnabled: draftMfaEnabled,
          passwordResetRequired: draftPasswordResetRequired
        })
      });
      setUsers((current) => current.map((user) => (user.id === response.user.id ? response.user : user)));
      setMessage(localize(t, "User access policy updated.", "사용자 접근 정책을 업데이트했습니다."));
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : localize(t, "Unable to update user policy.", "사용자 정책을 업데이트하지 못했습니다."));
    } finally {
      setUserAction(null);
    }
  }

  async function issuePasswordReset() {
    if (!selectedUser) return;
    setError(null);
    setUserAction("reset");
    try {
      const response = await api<{ user: ManagedUser; temporaryPassword: string; expiresIn: string }>(
        `/admin/users/${selectedUser.id}/password-reset`,
        { method: "POST" }
      );
      setUsers((current) => current.map((user) => (user.id === response.user.id ? response.user : user)));
      setTemporaryPassword(response.temporaryPassword);
      setRevealPassword(false);
      setDraftPasswordResetRequired(true);
      setMessage(
        localize(
          t,
          `Temporary password issued. Expires in ${response.expiresIn}.`,
          `임시 비밀번호를 발급했습니다. ${response.expiresIn} 후 만료됩니다.`
        )
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : localize(t, "Unable to issue temporary password.", "임시 비밀번호를 발급하지 못했습니다."));
    } finally {
      setUserAction(null);
    }
  }

  function toggleRole(role: UserRole) {
    setDraftRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  function toggleGroup(group: string) {
    setDraftGroups((current) =>
      current.includes(group) ? current.filter((item) => item !== group) : [...current, group]
    );
  }

  return (
    <div className="stack">
      <section className="overviewPanel userHero">
        <div>
          <span className="eyebrow">{localize(t, "Identity and access administration", "ID 및 접근 관리")}</span>
          <h2>{localize(t, "User Management", "사용자 관리")}</h2>
          <p>
            {localize(
              t,
              "Manage portal users, Vault-facing roles, owner groups, account status, MFA posture, password reset workflow, and session operations from one governed screen.",
              "포털 사용자, Vault 연동 Role, 소유 그룹, 계정 상태, MFA, 비밀번호 reset, 세션 작업을 한 화면에서 관리합니다."
            )}
          </p>
        </div>
        <div className="summaryRail">
          <MiniStat label={localize(t, "Users", "사용자")} value={users.length} />
          <MiniStat label={localize(t, "Admins", "관리자")} value={users.filter((user) => user.roles.includes("vault-admin")).length} />
          <MiniStat label={localize(t, "MFA enabled", "MFA 활성")} value={users.filter((user) => user.mfaEnabled).length} tone="good" />
          <MiniStat label={localize(t, "Locked", "잠김")} value={users.filter((user) => user.status === "locked").length} tone="risk" />
        </div>
      </section>

      {currentUser?.roles.includes("vault-admin") ? null : (
        <div className="noticePanel">
          {localize(
            t,
            "You can view users, but access changes and password reset require the vault-admin role. Login as admin@example.com for the full demo.",
            "사용자 조회는 가능하지만 권한 변경과 비밀번호 reset은 vault-admin 권한이 필요합니다. 전체 데모는 admin@example.com으로 로그인하세요."
          )}
        </div>
      )}

      <div className="userManagementGrid">
        <section className="tablePanel userDirectory">
          <div className="panelHeader">
            <div>
              <h2>{localize(t, "User directory", "사용자 디렉터리")}</h2>
              <p>{localize(t, "Search by user, role, or group.", "사용자, 권한, 그룹 기준으로 검색합니다.")}</p>
            </div>
          </div>
          <div className="userFilters">
            <label>
              {localize(t, "Search", "검색")}
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="developer / vault-admin" />
            </label>
            <label>
              {t.table.status}
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | UserStatus)}>
                <option value="all">{localize(t, "All", "전체")}</option>
                {userStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loadingUsers ? <div className="empty compact">{t.loading}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          <div className="userList">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                className={`userRow ${selectedUser?.id === user.id ? "selected" : ""}`}
                onClick={() => setSelectedUserId(user.id)}
                type="button"
              >
                <span className={`avatarMark ${user.status}`}>{user.displayName.slice(0, 1)}</span>
                <span>
                  <strong>{user.displayName}</strong>
                  <small>{user.email}</small>
                </span>
                <span className={`statusBadge ${user.status}`}>{user.status}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="tablePanel userDetailPanel">
          {selectedUser ? (
            <>
              <div className="detailTopline">
                <span className={`statusBadge ${selectedUser.status}`}>{selectedUser.status}</span>
                <span className="nodeKind">{selectedUser.authMode}</span>
                <span className={`riskBadge ${selectedUser.passwordResetRequired ? "medium" : "low"}`}>
                  {selectedUser.passwordResetRequired
                    ? localize(t, "RESET REQUIRED", "RESET 필요")
                    : localize(t, "PASSWORD OK", "비밀번호 정상")}
                </span>
              </div>
              <h2>{selectedUser.displayName}</h2>
              <p>{selectedUser.email}</p>

              <div className="detailStats">
                <MiniStat label={localize(t, "Roles", "권한")} value={draftRoles.length} />
                <MiniStat label={localize(t, "Groups", "그룹")} value={draftGroups.length} />
                <MiniStat label={localize(t, "Sessions", "세션")} value={selectedUser.activeSessions} />
              </div>

              <div className="accessEditor">
                <label>
                  {localize(t, "Account status", "계정 상태")}
                  <select
                    disabled={!canEdit}
                    value={draftStatus}
                    onChange={(event) => setDraftStatus(event.target.value as UserStatus)}
                  >
                    {userStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="toggleLine">
                  <input
                    disabled={!canEdit}
                    checked={draftMfaEnabled}
                    onChange={(event) => setDraftMfaEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  {localize(t, "MFA required", "MFA 필수")}
                </label>
                <label className="toggleLine">
                  <input
                    disabled={!canEdit}
                    checked={draftPasswordResetRequired}
                    onChange={(event) => setDraftPasswordResetRequired(event.target.checked)}
                    type="checkbox"
                  />
                  {localize(t, "Force password change at next login", "다음 로그인 시 비밀번호 변경 강제")}
                </label>
              </div>

              <section className="accessSection">
                <h3>{localize(t, "Role assignment", "권한 부여")}</h3>
                <div className="checkboxCloud">
                  {userRoles.map((role) => (
                    <label key={role} className="checkChip">
                      <input
                        disabled={!canEdit || (draftRoles.length === 1 && draftRoles.includes(role))}
                        checked={draftRoles.includes(role)}
                        onChange={() => toggleRole(role)}
                        type="checkbox"
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </section>

              <section className="accessSection">
                <h3>{localize(t, "Group and system ownership", "그룹 및 시스템 소유권")}</h3>
                <div className="checkboxCloud">
                  {availableGroups.map((group) => (
                    <label key={group} className="checkChip">
                      <input
                        disabled={!canEdit}
                        checked={draftGroups.includes(group)}
                        onChange={() => toggleGroup(group)}
                        type="checkbox"
                      />
                      {group}
                    </label>
                  ))}
                </div>
              </section>

              <section className="passwordPanel">
                <div>
                  <h3>{localize(t, "Password reset", "비밀번호 reset")}</h3>
                  <p>
                    {localize(
                      t,
                      "Temporary password is displayed once and is not stored by the portal.",
                      "임시 비밀번호는 1회 표시되며 포털에 저장하지 않습니다."
                    )}
                  </p>
                </div>
                <div className="actions">
                  <button disabled={!canEdit || userAction !== null} onClick={() => void issuePasswordReset()} type="button">
                    {localize(t, "Issue temporary password", "임시 비밀번호 발급")}
                  </button>
                  <button
                    disabled={!temporaryPassword}
                    onClick={() => setRevealPassword((current) => !current)}
                    type="button"
                  >
                    {revealPassword ? localize(t, "Hide", "숨기기") : localize(t, "Reveal once", "1회 보기")}
                  </button>
                </div>
                {temporaryPassword ? (
                  <div className="oneTimeSecret">
                    <code>{revealPassword ? temporaryPassword : "••••••••••••••••"}</code>
                    <button disabled={!revealPassword} onClick={() => void navigator.clipboard?.writeText(temporaryPassword)} type="button">
                      Copy
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="accessSection">
                <h3>{localize(t, "Session and audit controls", "세션 및 감사 제어")}</h3>
                <div className="sessionGrid">
                  <div>
                    <span>{localize(t, "Last login", "최근 로그인")}</span>
                    <strong>{selectedUser.lastLoginAt ? formatDate(selectedUser.lastLoginAt) : "-"}</strong>
                  </div>
                  <div>
                    <span>{localize(t, "Active sessions", "활성 세션")}</span>
                    <strong>{selectedUser.activeSessions}</strong>
                  </div>
                  <button
                    disabled={!canEdit}
                    onClick={() => setMessage(localize(t, "Session revoke queued in mock mode.", "Mock 모드에서 세션 폐기 작업을 예약했습니다."))}
                    type="button"
                  >
                    {localize(t, "Revoke sessions", "세션 폐기")}
                  </button>
                </div>
              </section>

              {message ? <div className="noticePanel compact">{message}</div> : null}

              <div className="actions">
                <button onClick={() => void loadUsers()} type="button">
                  {localize(t, "Reload", "새로고침")}
                </button>
                <button
                  className="primary"
                  disabled={!canEdit || draftRoles.length === 0 || userAction !== null}
                  onClick={() => void saveAccess()}
                  type="button"
                >
                  {localize(t, "Save user policy", "사용자 정책 저장")}
                </button>
              </div>
            </>
          ) : (
            <div className="empty compact">{t.table.noData}</div>
          )}
        </section>
      </div>

      <Table
        title={localize(t, "Recent user audit events", "최근 사용자 감사 이벤트")}
        columns={[t.table.time, t.table.actor, t.table.action, t.table.target, t.table.result]}
        rows={userAuditEvents.map((event) => [
          formatDate(event.createdAt),
          event.actorEmail,
          event.action,
          `${event.targetType}:${event.targetId.slice(0, 8)}`,
          event.result
        ])}
        emptyLabel={t.table.noData}
      />
    </div>
  );
}

function PlatformHealth({
  t,
  vaultHealth,
  mappingHealth
}: {
  t: Copy;
  vaultHealth: VaultHealthResponse | null;
  mappingHealth: VaultMappingHealth[];
}) {
  const healthyMappings = mappingHealth.filter((mapping) => mapping.reachable).length;
  return (
    <div className="stack">
      <section className="overviewPanel healthHero">
        <div>
          <span className="eyebrow">{localize(t, "Vault Health / Cluster Status", "Vault Health / Cluster Status")}</span>
          <h2>{localize(t, "Platform connectivity and mount reachability", "플랫폼 연결 및 Mount 접근 상태")}</h2>
          <p>
            {localize(
              t,
              "This view separates Vault platform health from business administration so operators can quickly validate seal state, version, cluster name, and namespace or mount reachability.",
              "Vault 플랫폼 상태를 업무 관리 화면에서 분리해 seal 상태, 버전, 클러스터명, Namespace/Mount 접근 가능 여부를 빠르게 확인합니다."
            )}
          </p>
        </div>
        <div className="summaryRail">
          <MiniStat
            label={localize(t, "Connected", "연결")}
            value={vaultHealth?.healthy ? 1 : 0}
            tone={vaultHealth?.healthy ? "good" : "risk"}
          />
          <MiniStat label={localize(t, "Reachable mounts", "접근 가능 Mount")} value={healthyMappings} tone="good" />
          <MiniStat label={localize(t, "Total mappings", "전체 매핑")} value={mappingHealth.length} />
          <MiniStat
            label={localize(t, "Blocked", "차단/오류")}
            value={Math.max(mappingHealth.length - healthyMappings, 0)}
            tone={mappingHealth.length - healthyMappings > 0 ? "risk" : "default"}
          />
        </div>
      </section>

      <div className="dashboardGrid">
        <section className="insightPanel">
          <h2>{localize(t, "Cluster status", "클러스터 상태")}</h2>
          <dl className="compactDl">
            <dt>{t.table.mode}</dt>
            <dd>{vaultHealth?.mode ?? t.admin.unknown}</dd>
            <dt>{t.table.healthy}</dt>
            <dd>{vaultHealth?.healthy === true ? t.admin.yes : vaultHealth?.healthy === false ? t.admin.no : t.admin.unknown}</dd>
            <dt>{localize(t, "Seal status", "Seal 상태")}</dt>
            <dd>{String(vaultHealth?.detail.sealed ?? vaultHealth?.detail.seal_status ?? "mock/unknown")}</dd>
            <dt>{t.table.version}</dt>
            <dd>{String(vaultHealth?.detail.version ?? "-")}</dd>
            <dt>{t.table.cluster}</dt>
            <dd>{String(vaultHealth?.detail.cluster_name ?? vaultHealth?.detail.clusterName ?? "-")}</dd>
          </dl>
        </section>
        <section className="insightPanel">
          <h2>{localize(t, "Namespace / mount summary", "Namespace / Mount 요약")}</h2>
          <div className="dependencyChipCloud">
            {Array.from(new Set(mappingHealth.map((mapping) => mapping.namespace ?? "root"))).map((namespace) => (
              <span key={namespace}>{namespace}</span>
            ))}
          </div>
          <div className="dependencyOrbitStats">
            <MiniStat label={localize(t, "Mock", "Mock")} value={mappingHealth.filter((mapping) => mapping.status === "mock").length} />
            <MiniStat label={localize(t, "HTTP OK", "HTTP OK")} value={mappingHealth.filter((mapping) => mapping.status === 200 || mapping.reachable).length} tone="good" />
            <MiniStat label={localize(t, "Errors", "오류")} value={mappingHealth.filter((mapping) => !mapping.reachable).length} tone="risk" />
          </div>
        </section>
      </div>

      <Table
        title={localize(t, "Namespace and mount reachability", "Namespace 및 Mount 접근성")}
        columns={[t.table.system, t.table.type, t.table.namespace, t.table.mount, t.table.role, t.table.reachable]}
        rows={mappingHealth.map((mapping) => [
          mapping.systemName,
          mapping.requestType,
          mapping.namespace ?? "-",
          mapping.mountPath,
          mapping.roleName,
          mapping.reachable ? t.admin.yes : `${t.admin.no} (${mapping.status})`
        ])}
        emptyLabel={t.table.noData}
      />
    </div>
  );
}

function Admin({
  t,
  systems,
  vaultHealth,
  mappingHealth
}: {
  t: Copy;
  systems: SystemSummary[];
  vaultHealth: VaultHealthResponse | null;
  mappingHealth: VaultMappingHealth[];
}) {
  return (
    <div className="stack">
      <Table
        title={t.admin.health}
        columns={[t.table.mode, t.table.healthy, t.table.version, t.table.cluster]}
        rows={[
          [
            vaultHealth?.mode ?? t.admin.unknown,
            vaultHealth?.healthy === true ? t.admin.yes : vaultHealth?.healthy === false ? t.admin.no : t.admin.unknown,
            String(vaultHealth?.detail.version ?? "-"),
            String(vaultHealth?.detail.cluster_name ?? "-")
          ]
        ]}
        emptyLabel={t.table.noData}
      />
      <Table
        title={t.admin.catalog}
        columns={[t.table.plugin, t.table.mount, t.table.requestType, t.table.status, t.table.mode]}
        rows={[
          ["GitLab token", "gitlab-token/", "CUSTOM_GITLAB_TOKEN", "ready", "mock"],
          ["Jenkins token", "jenkins-token/", "CUSTOM_JENKINS_TOKEN", "ready", "mock"],
          ["Legacy API token", "legacy-api-token/", "CUSTOM_LEGACY_API_TOKEN", "ready", "mock"],
          ["Kafka access", "kafka-access/", "CUSTOM_KAFKA_ACCESS", "planned", "mock"],
          ["Network device rotation", "network-rotation/", "NETWORK_DEVICE_ROTATION", "planned", "mock"]
        ]}
        emptyLabel={t.table.noData}
      />
      <section className="tablePanel">
        <h2>{localize(t, "Notification integrations", "Notification 연동")}</h2>
        <div className="notificationGrid">
          {["Slack", "Email", "Teams", "ServiceNow", "Jira"].map((channel) => (
            <div key={channel} className="notificationCard">
              <strong>{channel}</strong>
              <span>{localize(t, "mock enabled", "mock 활성화")}</span>
              <small>{localize(t, "Approval request, expiring soon, revoke failure", "승인 요청, 만료 임박, 폐기 실패")}</small>
            </div>
          ))}
        </div>
      </section>
      <Table
        title={t.admin.mappings}
        columns={[t.table.system, t.table.namespace, t.table.mount, t.table.role, localize(t, "Policy", "Policy")]}
        rows={systems.flatMap((system) =>
          system.vaultMountMappings.map((mapping) => [
            system.name,
            system.vaultNamespace,
            mapping.mountPath,
            mapping.roleName,
            policyName({
              id: mapping.id,
              systemId: system.id,
              systemName: system.name,
              systemDescription: system.description,
              ownerGroup: system.ownerGroup,
              environment: system.environment,
              namespace: system.vaultNamespace,
              mountPath: mapping.mountPath,
              roleName: mapping.roleName,
              requestType: mapping.requestType,
              displayName: mapping.displayName,
              enabled: mapping.enabled
            })
          ])
        )}
        emptyLabel={t.table.noData}
      />
      <Table
        title={t.admin.inspection}
        columns={[t.table.system, t.table.type, t.table.mount, t.table.role, t.table.reachable]}
        rows={mappingHealth.map((mapping) => [
          mapping.systemName,
          mapping.requestType,
          mapping.mountPath,
          mapping.roleName,
          mapping.reachable ? t.admin.yes : `${t.admin.no} (${mapping.status})`
        ])}
        emptyLabel={t.table.noData}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: number;
  detail?: string;
  tone?: "default" | "risk";
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "risk";
}) {
  return (
    <div className={`miniStat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PostureRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(4, Math.round((value / max) * 100));
  return (
    <div className="postureRow">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="barTrack">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Table({
  title,
  columns,
  rows,
  emptyLabel = "No data."
}: {
  title: string;
  columns: string[];
  rows: string[][];
  emptyLabel?: string;
}) {
  return (
    <section className="tablePanel">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <div className="empty compact">{emptyLabel}</div>
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

type RiskLevel = "low" | "medium" | "high";
type RiskScore = {
  level: RiskLevel;
  score: number;
  reasons: string[];
};
type LifecycleStep = {
  label: string;
  detail: string;
  state: "done" | "current" | "blocked" | "future";
};

function filterLabel(filter: PluginFilter, t: Copy): string {
  switch (filter) {
    case "all":
      return localize(t, "All", "전체");
    case "auth":
      return "Auth";
    case "secret":
      return localize(t, "Secret", "Secret");
    case "database":
      return localize(t, "Database", "Database");
    case "partner":
      return localize(t, "Partner", "파트너");
    case "community":
      return localize(t, "Community", "커뮤니티");
    case "learning":
      return localize(t, "Learning", "학습용");
  }
}

function filterForTemplate(template: VaultPluginTemplate): PluginFilter {
  if (template.source === "learning" || template.source === "community" || template.source === "partner") {
    return template.source;
  }
  return template.pluginType;
}

function templateMatchesFilter(template: VaultPluginTemplate, filter: PluginFilter): boolean {
  if (filter === "all") return true;
  if (filter === "partner" || filter === "community" || filter === "learning") return template.source === filter;
  return template.pluginType === filter;
}

function pluginTypeLabel(pluginType: VaultPluginType, t: Copy): string {
  switch (pluginType) {
    case "auth":
      return "Auth";
    case "secret":
      return localize(t, "Secret engine", "Secret engine");
    case "database":
      return localize(t, "Database", "Database");
  }
}

function sourceLabel(source: VaultPluginTemplate["source"], t: Copy): string {
  switch (source) {
    case "official":
      return localize(t, "Official", "공식");
    case "partner":
      return localize(t, "Partner", "파트너");
    case "learning":
      return localize(t, "Learning", "학습용");
    case "community":
      return localize(t, "Community", "커뮤니티");
  }
}

function normalizeFactoryPrompt(prompt: string): string {
  const normalized = prompt.toLowerCase();
  const synonyms: Array<[string, string]> = [
    ["카프카", "kafka"],
    ["컨플루언트", "confluent"],
    ["쿠버네티스", "kubernetes"],
    ["쿠버", "kubernetes"],
    ["레디스", "redis"],
    ["오라클", "oracle"],
    ["스노우플레이크", "snowflake"],
    ["몽고", "mongo"],
    ["미니오", "minio"],
    ["베나피", "venafi"],
    ["슬랙", "slack"],
    ["스파이어", "spire"],
    ["엘라스틱", "elasticsearch"],
    ["지씨피", "gcp"],
    ["구글", "gcp"],
    ["애저", "azure"],
    ["에이디", "ad"],
    ["엘디에이피", "ldap"],
    ["깃허브", "github"],
    ["섹티고", "sectigo"],
    ["디지서트", "digicert"],
    ["원패스워드", "onepassword"],
    ["원 패스워드", "onepassword"],
    ["키클록", "keycloak"],
    ["넷박스", "netbox"],
    ["넥서스", "nexus"],
    ["그라파나", "grafana"],
    ["오픈에이아이", "openai"],
    ["세일즈포스", "salesforce"],
    ["솔라스", "solace"],
    ["프록스목스", "proxmox"],
    ["스플렁크", "splunk"],
    ["아르고시디", "argocd"],
    ["아르고", "argocd"],
    ["도커허브", "dockerhub"],
    ["도커 허브", "dockerhub"],
    ["테일스케일", "tailscale"],
    ["데이터독", "datadog"],
    ["아이비엠 클라우드", "ibmcloud"],
    ["오리 인증", "ory"],
    ["클릭하우스", "clickhouse"],
    ["큐드란트", "qdrant"],
    ["클라우드플레어", "cloudflare"],
    ["오픈스택", "openstack"],
    ["셰프", "chef"],
    ["브이스피어", "vsphere"],
    ["에어로스파이크", "aerospike"],
    ["아랑고디비", "arangodb"],
    ["이벤트스토어", "eventstoredb"]
  ];
  return synonyms.reduce((value, [source, target]) => value.replaceAll(source, `${source} ${target}`), normalized);
}

function findTemplateFromPrompt(prompt: string, templates: VaultPluginTemplate[]): VaultPluginTemplate | null {
  const normalized = normalizeFactoryPrompt(prompt);
  const ignore = new Set([
    "plugin",
    "plugins",
    "vault",
    "make",
    "create",
    "generate",
    "scaffold",
    "apply",
    "enable",
    "register",
    "please",
    "플러그인",
    "만들어줘",
    "만들어",
    "생성",
    "제작",
    "적용",
    "등록",
    "활성",
    "해줘"
  ]);
  const tokens = normalized
    .split(/[^a-z0-9가-힣]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !ignore.has(token));

  let best: { template: VaultPluginTemplate; score: number } | null = null;
  for (const template of templates) {
    const haystack = [
      template.name,
      template.displayName,
      template.description,
      template.integrationTarget,
      template.repository,
      template.tags.join(" ")
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    if (normalized.includes(template.name.toLowerCase())) score += 80;
    if (normalized.includes(template.integrationTarget.toLowerCase())) score += 35;
    for (const token of tokens) {
      if (template.integrationTarget.toLowerCase() === token) score += 30;
      else if (template.name.toLowerCase().includes(token)) score += 18;
      else if (haystack.includes(token)) score += 8;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { template, score };
    }
  }
  return best && best.score >= 8 ? best.template : null;
}

function pluginCatalogSummary(templates: VaultPluginTemplate[], t: Copy, filter: PluginFilter = "all"): string {
  const selected = templates.filter((template) => templateMatchesFilter(template, filter));
  const groups = (["auth", "secret", "database"] as VaultPluginType[])
    .map((pluginType) => ({ pluginType, templates: selected.filter((template) => template.pluginType === pluginType) }))
    .filter((group) => group.templates.length > 0);
  const heading = localize(
    t,
    `I can currently make ${selected.length} ${filter === "all" ? "plugin" : filter} templates. Here is the complete list:`,
    `현재 만들 수 있는 ${filter === "all" ? "전체 플러그인" : filter} 템플릿은 ${selected.length}개입니다. 전체 목록은 다음과 같습니다:`
  );
  return [
    heading,
    ...groups.map((group) => {
      const label = group.pluginType === "auth" ? "Auth" : group.pluginType === "secret" ? "Secret engine" : "Database";
      return `${label} (${group.templates.length})\n${group.templates
        .map((template, index) => `${index + 1}. ${template.displayName}`)
        .join("\n")}`;
    })
  ].join("\n\n");
}

function factoryWelcomeMessage(t: Copy): string {
  return localize(
    t,
    "Describe the Vault plugin you need. I will match it to the right Factory template, show each generation step in real time, and continue to the guarded Vault apply flow when you are ready.",
    "필요한 Vault 플러그인을 말씀해주세요. 적합한 Factory 템플릿을 찾아 생성 과정을 실시간으로 보여드리고, 준비되면 검증 절차를 거쳐 Vault 적용까지 진행하겠습니다."
  );
}

function factoryStartMessage(template: VaultPluginTemplate, wantsApply: boolean, t: Copy): string {
  return localize(
    t,
    wantsApply
      ? `Good, I found the ${template.displayName} template. I will generate the scaffold first, then continue into the Vault apply step in the same flow.`
      : `Good, I found the ${template.displayName} template. I will generate the scaffold now and show each step in the console so you can see what the Factory is doing.`,
    wantsApply
      ? `좋아요, ${template.displayName} 템플릿을 찾았습니다. 먼저 스캐폴드를 만들고, 같은 흐름에서 Vault 적용 단계까지 이어가겠습니다.`
      : `좋아요, ${template.displayName} 템플릿을 찾았습니다. 지금 스캐폴드를 만들면서 Factory가 어떤 일을 하는지 콘솔에 단계별로 보여드릴게요.`
  );
}

function factoryGeneratedMessage(result: VaultPluginGenerateResult, wantsApply: boolean, t: Copy): string {
  return localize(
    t,
    wantsApply
      ? `The scaffold is ready: ${result.files.length} files were generated for ${result.pluginName}, mounted at ${result.mountPath}/ with version ${result.version}. I am moving on to the Vault apply step now.`
      : `The scaffold is ready. I generated ${result.files.length} files for ${result.pluginName}, set the default mount to ${result.mountPath}/, and prepared version ${result.version}. If this looks right, tell me "Apply it to Vault" and I will register and enable it.`,
    wantsApply
      ? `스캐폴드가 준비됐습니다. ${result.pluginName} 기준으로 ${result.files.length}개 파일을 만들었고, mount는 ${result.mountPath}/, version은 ${result.version}으로 잡았습니다. 이제 바로 Vault 적용 단계로 넘어갈게요.`
      : `스캐폴드가 준비됐습니다. ${result.pluginName} 기준으로 ${result.files.length}개 파일을 만들었고, 기본 mount는 ${result.mountPath}/, version은 ${result.version}으로 잡았습니다. 괜찮으면 "Vault에 적용해줘"라고 말해주세요. 제가 등록과 활성화까지 이어가겠습니다.`
  );
}

function factoryAppliedMessage(result: VaultPluginApplyResult, t: Copy): string {
  return localize(
    t,
    `Done. I applied ${result.pluginName} to Vault at ${result.mountPath}/ in ${result.mode} mode. The Factory result is now ready for review in the apply plan below.`,
    `완료했습니다. ${result.pluginName}을 ${result.mountPath}/ 경로에 ${result.mode} 모드로 적용했습니다. 아래 적용 계획에서 결과를 바로 확인할 수 있어요.`
  );
}

function localize(t: Copy, en: string, ko: string): string {
  return t === copy.ko ? ko : en;
}

function scoreRisk({
  requestType,
  ttl,
  environment,
  scope,
  riskLevel
}: {
  requestType: RequestType;
  ttl?: string;
  environment?: SystemSummary["environment"];
  scope?: string;
  riskLevel?: RiskLevel;
}): RiskScore {
  const reasons: string[] = [];
  let score = 8;
  const normalizedScope = (scope ?? "").toLowerCase();
  const hours = parseTtlHours(ttl ?? "1h");

  if (environment === "prod") {
    score += 35;
    reasons.push("prod environment");
  } else if (environment === "staging") {
    score += 15;
    reasons.push("staging environment");
  } else {
    reasons.push("dev environment");
  }

  if (requestType.includes("DB")) {
    score += 22;
    reasons.push("database credential request");
  }
  if (requestType.includes("WRITE") || normalizedScope.includes("write")) {
    score += 20;
    reasons.push("write-capable permission");
  }
  if (requestType.includes("SSH") || requestType.includes("PKI")) {
    score += 14;
    reasons.push("certificate or SSH issuance");
  }
  if (requestType.includes("CUSTOM")) {
    score += 10;
    reasons.push("custom plugin token path");
  }
  if (requestType.includes("NETWORK")) {
    score += 30;
    reasons.push("network/security device rotation");
  }
  if (normalizedScope.includes("admin") || normalizedScope.includes("maintainer")) {
    score += 24;
    reasons.push("admin or maintainer scope");
  }
  if (hours >= 8) {
    score += 24;
    reasons.push("TTL is 8h or longer");
  } else if (hours >= 4) {
    score += 14;
    reasons.push("TTL is 4h or longer");
  } else {
    reasons.push("short TTL");
  }
  if (riskLevel === "high") score += 16;
  if (riskLevel === "medium") score += 8;

  return {
    score,
    level: score >= 66 ? "high" : score >= 36 ? "medium" : "low",
    reasons: Array.from(new Set(reasons))
  };
}

function parseTtlHours(ttl: string): number {
  const value = Number.parseFloat(ttl);
  if (Number.isNaN(value)) return 1;
  if (ttl.endsWith("m")) return value / 60;
  if (ttl.endsWith("d")) return value * 24;
  return value;
}

function RiskBadge({ risk }: { risk: RiskScore }) {
  return (
    <span className={`riskBadge ${risk.level}`}>
      {risk.level.toUpperCase()} · {risk.score}
    </span>
  );
}

function LifecycleTimeline({ steps, compact = false }: { steps: LifecycleStep[]; compact?: boolean }) {
  return (
    <ol className={`lifecycleTimeline ${compact ? "compactTimeline" : ""}`}>
      {steps.map((step) => (
        <li key={step.label} className={step.state}>
          <span />
          <div>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function credentialLifecycleSteps(
  t: Copy,
  request: AccessRequest | undefined,
  credential: IssuedCredential | undefined
): LifecycleStep[] {
  const requested = request?.createdAt ?? credential?.createdAt;
  const approved = request?.approvedAt;
  const issued = request?.executedAt ?? credential?.createdAt;
  const terminal = credential?.revokedAt ?? credential?.expiresAt;
  const credentialStatus = credential?.status ?? "active";
  return [
    {
      label: localize(t, "Requested", "요청됨"),
      detail: requested ? formatDate(requested) : "-",
      state: requested ? "done" : "future"
    },
    {
      label: localize(t, "Approved", "승인됨"),
      detail: approved ? formatDate(approved) : localize(t, "waiting approval", "승인 대기"),
      state: approved ? "done" : request?.status === "rejected" ? "blocked" : "future"
    },
    {
      label: localize(t, "Issued", "발급됨"),
      detail: issued ? formatDate(issued) : localize(t, "not issued", "미발급"),
      state: issued ? "done" : "future"
    },
    {
      label: localize(t, "In use", "사용 중"),
      detail: credential?.status ?? localize(t, "not active", "비활성"),
      state: credentialStatus === "active" ? "current" : credential ? "done" : "future"
    },
    {
      label: localize(t, "Expired / revoked", "만료/폐기"),
      detail: terminal ? formatDate(terminal) : localize(t, "scheduled by TTL", "TTL 기준 예정"),
      state: credentialStatus === "revoked" || credentialStatus === "expired" ? "done" : credentialStatus === "revoke_failed" ? "blocked" : "future"
    }
  ];
}

function requestLifecycleSteps(t: Copy, request: AccessRequest, events: AuditEvent[]): LifecycleStep[] {
  const relatedEvents = events.filter((event) => event.targetId === request.id);
  const latestEvent = relatedEvents[0];
  return [
    {
      label: localize(t, "Requested", "요청됨"),
      detail: formatDate(request.createdAt),
      state: "done"
    },
    {
      label: localize(t, "Reviewed", "검토됨"),
      detail: latestEvent ? `${latestEvent.action} / ${latestEvent.actorEmail}` : localize(t, "pending reviewer action", "승인자 작업 대기"),
      state: request.status === "pending" ? "current" : request.status === "rejected" ? "blocked" : "done"
    },
    {
      label: localize(t, "Executed", "실행됨"),
      detail: request.executedAt ? formatDate(request.executedAt) : localize(t, "not executed", "미실행"),
      state: request.executedAt ? "done" : request.status === "approved" ? "current" : "future"
    }
  ];
}

function buildSecretSurfaces(systems: SystemSummary[]): SecretSurface[] {
  return systems.flatMap((system) =>
    system.vaultMountMappings.map((mapping) => ({
      id: mapping.id,
      systemId: system.id,
      systemName: system.name,
      systemDescription: system.description,
      ownerGroup: system.ownerGroup,
      environment: system.environment,
      namespace: system.vaultNamespace,
      mountPath: mapping.mountPath,
      roleName: mapping.roleName,
      requestType: mapping.requestType,
      displayName: mapping.displayName,
      enabled: mapping.enabled
    }))
  );
}

function buildDependencyMapModel(
  systems: SystemSummary[],
  surfaces: SecretSurface[],
  credentials: IssuedCredential[]
): { nodes: DependencyNode[]; edges: DependencyEdge[] } {
  const namespaces = Array.from(new Set(systems.map((system) => system.vaultNamespace)));
  const nodes: DependencyNode[] = [
    { id: "vault", kind: "vault", label: "Vault", sublabel: "Enterprise core", x: 50, y: 10 }
  ];
  const edges: DependencyEdge[] = [];

  namespaces.forEach((namespace, index) => {
    const id = `namespace:${namespace}`;
    nodes.push({
      id,
      kind: "namespace",
      label: namespace,
      sublabel: "namespace",
      x: spread(index, namespaces.length, 18, 82),
      y: 27,
      namespace
    });
    edges.push({ from: "vault", to: id, tone: "vault" });
  });

  systems.forEach((system, index) => {
    const id = `system:${system.id}`;
    nodes.push({
      id,
      kind: "system",
      label: system.name,
      sublabel: `${system.environment} / ${system.ownerGroup}`,
      x: spread(index, systems.length, 12, 88),
      y: 40,
      namespace: system.vaultNamespace,
      systemName: system.name
    });
    edges.push({ from: `namespace:${system.vaultNamespace}`, to: id, tone: "namespace" });
  });

  const surfaceRows = Math.min(3, Math.max(surfaces.length, 1));
  const surfaceColumns = Math.max(Math.ceil(surfaces.length / surfaceRows), 1);
  surfaces.forEach((surface, index) => {
    const id = `surface:${surface.id}`;
    const surfaceRow = index % surfaceRows;
    const surfaceColumn = Math.floor(index / surfaceRows);
    nodes.push({
      id,
      kind: "surface",
      label: surface.displayName,
      sublabel: `${surface.mountPath} / ${surface.roleName}`,
      x: spread(surfaceColumn, surfaceColumns, 12, 88),
      y: 51 + surfaceRow * 9,
      namespace: surface.namespace,
      systemName: surface.systemName,
      surface
    });
    edges.push({ from: `system:${surface.systemId}`, to: id, tone: "system" });
  });

  const credentialRows = Math.min(3, Math.max(credentials.length, 1));
  const credentialColumns = Math.max(Math.ceil(credentials.length / credentialRows), 1);
  credentials.forEach((credential, index) => {
    const matchingSurface = surfaces.find(
      (surface) => surface.systemName === credential.systemName && surface.requestType === credential.requestType
    );
    const id = `credential:${credential.id}`;
    const credentialRow = index % credentialRows;
    const credentialColumn = Math.floor(index / credentialRows);
    nodes.push({
      id,
      kind: "credential",
      label: credential.requestType,
      sublabel: `${credential.status} / ${credential.ttl}`,
      x: spread(credentialColumn, credentialColumns, 16, 84),
      y: 80 + credentialRow * 8,
      namespace: matchingSurface?.namespace,
      systemName: credential.systemName,
      surface: matchingSurface,
      credential
    });
    if (matchingSurface) {
      edges.push({ from: `surface:${matchingSurface.id}`, to: id, tone: "lease" });
    }
  });

  return { nodes, edges };
}

function spread(index: number, total: number, min: number, max: number): number {
  if (total <= 1) return (min + max) / 2;
  return min + ((max - min) * index) / (total - 1);
}

function getRelatedSurfaces(node: DependencyNode, surfaces: SecretSurface[]): SecretSurface[] {
  if (node.kind === "surface" && node.surface) return [node.surface];
  if (node.kind === "credential" && node.surface) return [node.surface];
  if (node.kind === "system") return surfaces.filter((surface) => surface.systemName === node.systemName);
  if (node.kind === "namespace") return surfaces.filter((surface) => surface.namespace === node.namespace);
  return surfaces;
}

function getRelatedCredentials(
  node: DependencyNode,
  surfaces: SecretSurface[],
  credentials: IssuedCredential[]
): IssuedCredential[] {
  if (node.kind === "credential" && node.credential) return [node.credential];
  const relatedSurfaces = getRelatedSurfaces(node, surfaces);
  return credentials.filter((credential) =>
    relatedSurfaces.some(
      (surface) => surface.systemName === credential.systemName && surface.requestType === credential.requestType
    )
  );
}

function policyName(surface: SecretSurface): string {
  return `${slug(surface.systemName)}-${slug(surface.requestType)}-policy`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function requestTypeDescription(t: Copy, type: RequestType): string {
  const descriptions: Record<RequestType, [string, string]> = {
    KV_READ: ["Read a mapped KV secret without storing plaintext in the portal.", "KV Secret을 읽되 포털에는 평문을 저장하지 않습니다."],
    KV_WRITE: ["Register or update a KV secret through an approved workflow.", "승인 워크플로우를 통해 KV Secret을 등록/수정합니다."],
    DB_CREDENTIAL: ["Issue short-lived database credentials through Vault.", "Vault를 통해 단기 DB Credential을 발급합니다."],
    PKI_CERTIFICATE: ["Issue a certificate with governed TTL and role mapping.", "Role 매핑과 TTL 기준으로 인증서를 발급합니다."],
    SSH_CERTIFICATE: ["Issue an SSH certificate for temporary operational access.", "운영 접근용 임시 SSH 인증서를 발급합니다."],
    APPROLE_SECRET_ID: ["Issue a wrapped SecretID for application bootstrap.", "애플리케이션 부트스트랩용 Wrapped SecretID를 발급합니다."],
    CUSTOM_GITLAB_TOKEN: ["Request a GitLab project or group token via a Vault plugin.", "Vault Plugin을 통해 GitLab 프로젝트/그룹 토큰을 요청합니다."],
    CUSTOM_JENKINS_TOKEN: ["Request a temporary Jenkins API token via a Vault plugin.", "Vault Plugin을 통해 임시 Jenkins API 토큰을 요청합니다."],
    CUSTOM_ARTIFACTORY_TOKEN: ["Request an Artifactory token with lease tracking.", "Lease 추적이 가능한 Artifactory 토큰을 요청합니다."],
    CUSTOM_KAFKA_ACCESS: ["Request Kafka ACL metadata and client credential material.", "Kafka ACL 메타데이터와 클라이언트 Credential을 요청합니다."],
    CUSTOM_LEGACY_API_TOKEN: ["Request a legacy internal API token through Vault.", "Vault를 통해 Legacy 내부 API 토큰을 요청합니다."],
    NETWORK_DEVICE_ROTATION: ["Trigger governed network/security device credential rotation.", "네트워크/보안 장비 Credential 회전을 승인 기반으로 실행합니다."]
  };
  const [en, ko] = descriptions[type];
  return localize(t, en, ko);
}

function buildCsv(columns: string[], rows: string[][]): string {
  return [columns, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function buildAuditReport(title: string, columns: string[], rows: string[][]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#111827}h1{font-size:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d8dee8;padding:8px;text-align:left;font-size:12px}th{background:#f8fafc}</style></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.print()</script></body></html>`;
}

function dataDownloadHref(mimeType: string, content: string): string {
  return `data:${mimeType},${encodeURIComponent(content)}`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string") {
        detail = payload.error;
      }
    } catch {
      // Keep the HTTP status text when the response is not JSON.
    }
    throw new Error(`${response.status} ${detail}`);
  }
  return (await response.json()) as T;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function shortId(value: string): string {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
