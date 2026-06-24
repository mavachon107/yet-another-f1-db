import React, { lazy, Suspense, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ChatProvider } from "./context/ChatContext.jsx";
import { CreateModalProvider } from "./context/CreateModalContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import { SITE_ORIGIN, BRAND } from "./components/SeoHead.jsx";

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      name: BRAND,
      url: `${SITE_ORIGIN}/`,
      description:
        "Formula 1 historical data: race results, championships, drivers, teams, constructors, circuits and statistics from 1950 to today.",
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: BRAND,
      url: `${SITE_ORIGIN}/`,
      logo: `${SITE_ORIGIN}/og-image.png`,
    },
  ],
};

const CarList = lazy(() => import("./pages/CarList.jsx"));
const CarDetail = lazy(() => import("./pages/CarDetail.jsx"));
const ConstructorList = lazy(() => import("./pages/ConstructorList.jsx"));
const ConstructorDetail = lazy(() => import("./pages/ConstructorDetail.jsx"));
const CircuitList = lazy(() => import("./pages/CircuitList.jsx"));
const CircuitDetail = lazy(() => import("./pages/CircuitDetail.jsx"));
const DriverDetail = lazy(() => import("./pages/DriverDetail.jsx"));
const DriverList = lazy(() => import("./pages/DriverList.jsx"));
const EngineDetail = lazy(() => import("./pages/EngineDetail.jsx"));
const EngineList = lazy(() => import("./pages/EngineList.jsx"));
const EventEntryCompare = lazy(() => import("./pages/EventEntryCompare.jsx"));
const EventEntryList = lazy(() => import("./pages/EventEntryList.jsx"));
const FastestLapsDetail = lazy(() => import("./pages/FastestLapsDetail.jsx"));
const EventReferences = lazy(() => import("./pages/EventReferences.jsx"));
const PracticeDetails = lazy(() => import("./pages/PracticeDetails.jsx"));
const StandingDetail = lazy(() => import("./pages/StandingDetail.jsx"));
const EventsSeason = lazy(() => import("./pages/EventsSeason.jsx"));
const EventSessions = lazy(() => import("./pages/EventSessions.jsx"));
const EventLayout = lazy(() => import("./pages/EventLayout.jsx"));
const MainMenu = lazy(() => import("./pages/MainMenu.jsx"));
const QualifyingDetails = lazy(() => import("./pages/QualifyingDetails.jsx"));
const RaceResultDetails = lazy(() => import("./pages/RaceResultDetails.jsx"));
const DriverOfTheDayDetail = lazy(() => import("./pages/DriverOfTheDayDetail.jsx"));
const SpeedTrapDetail = lazy(() => import("./pages/SpeedTrapDetail.jsx"));
const SeasonList = lazy(() => import("./pages/SeasonList.jsx"));
const StatsDashboard = lazy(() => import("./pages/StatsDashboard.jsx"));
const SchedulerLogs = lazy(() => import("./pages/SchedulerLogs.jsx"));
const TeamDetail = lazy(() => import("./pages/TeamDetail.jsx"));
const TeamList = lazy(() => import("./pages/TeamList.jsx"));
const AboutPage = lazy(() => import("./pages/AboutPage.jsx"));
const MethodologyPage = lazy(() => import("./pages/MethodologyPage.jsx"));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage.jsx"));
const DisclaimerPage = lazy(() => import("./pages/DisclaimerPage.jsx"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage.jsx"));
const DocsPage = lazy(() => import("./pages/DocsPage.jsx"));
const ChatWidget = lazy(() => import("./components/ChatWidget.jsx"));

const BUILD_VERSION = import.meta.env.VITE_APP_VERSION || "dev";
const AI_CHAT_ENABLED = true;

function AppLayout({ children }) {
  const { isLoggedIn, openLoginModal, openProfileModal, handleLogout, profileIdentity, profileInitial } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; }
    catch { return false; }
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  };

  return (
    <div className="app-shell">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(SITE_JSON_LD)}
        </script>
      </Helmet>
      <div className="bg-orbits"></div>
      <div className="app-body">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          isLoggedIn={isLoggedIn}
          openLoginModal={openLoginModal}
          openProfileModal={openProfileModal}
          handleLogout={handleLogout}
          profileIdentity={profileIdentity}
          profileInitial={profileInitial}
        />
        <div className="app-content">
          <main>{children}</main>
          <SiteFooter buildVersion={BUILD_VERSION} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CreateModalProvider>
          <AppLayout>
            <Suspense fallback={<div className="status-card">Loading…</div>}>
              <Routes>
                <Route path="/" element={<Navigate to="/seasons/2026" replace />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/methodology" element={<MethodologyPage />} />
                <Route path="/changelog" element={<ChangelogPage />} />
                <Route path="/legal/disclaimer" element={<DisclaimerPage />} />
                <Route path="/legal/privacy" element={<PrivacyPage />} />
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/cars" element={<CarList />} />
                <Route path="/engines" element={<EngineList />} />
                <Route path="/seasons" element={<SeasonList />} />
                <Route path="/drivers" element={<DriverList />} />
                <Route path="/teams" element={<TeamList />} />
                <Route path="/circuits" element={<CircuitList />} />
                <Route path="/stats" element={<Navigate to="/stats/global" replace />} />
                <Route path="/stats/global" element={<StatsDashboard />} />
                <Route path="/stats/drivers" element={<StatsDashboard />} />
                <Route path="/stats/constructors" element={<StatsDashboard />} />
                <Route path="/admin/scheduler" element={<SchedulerLogs />} />
                <Route path="/seasons/:seasonYear" element={<EventsSeason />} />
                <Route path="/seasons/:seasonYear/events/:eventSlug" element={<EventLayout />}>
                  <Route index element={<PracticeDetails />} />
                  <Route path="sessions" element={<EventSessions />} />
                  <Route path="practice" element={<PracticeDetails />} />
                  <Route path="fastest-lap" element={<FastestLapsDetail />} />
                  <Route path="standings" element={<StandingDetail />} />
                  <Route path="references" element={<EventReferences />} />
                  <Route path="entry-list" element={<EventEntryList />} />
                  <Route path="entry-compare" element={<EventEntryCompare />} />
                  <Route path="qualifying" element={<QualifyingDetails />} />
                  <Route path="sprint-qualifying" element={<QualifyingDetails />} />
                  <Route path="race" element={<RaceResultDetails />} />
                  <Route path="driver-of-the-day" element={<DriverOfTheDayDetail />} />
                  <Route path="speed-trap" element={<SpeedTrapDetail />} />
                </Route>
                <Route path="/drivers/:slug" element={<DriverDetail />} />
                <Route path="/cars/:carId" element={<CarDetail />} />
                <Route path="/engines/:engineId" element={<EngineDetail />} />
                <Route path="/constructors" element={<ConstructorList />} />
                <Route path="/constructors/:constructorId" element={<ConstructorDetail />} />
                <Route path="/circuits/:circuitId" element={<CircuitDetail />} />
                <Route path="/teams/:teamId" element={<TeamDetail />} />
              </Routes>
            </Suspense>
          </AppLayout>
          {AI_CHAT_ENABLED && (
            <ChatProvider>
              <Suspense fallback={null}>
                <ChatWidget />
              </Suspense>
            </ChatProvider>
          )}
        </CreateModalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
