import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { Layout } from "@/components/layout/Layout";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Home = lazy(() => import("@/pages/Home"));
const Search = lazy(() => import("@/pages/Search"));
const Library = lazy(() => import("@/pages/Library"));
const Document = lazy(() => import("@/pages/Document"));
const GraphView = lazy(() => import("@/pages/GraphView"));
const BookWorkspace = lazy(() => import("@/pages/BookWorkspace"));
const ResearchView = lazy(() => import("@/pages/ResearchView"));
const Experiments = lazy(() => import("@/pages/Experiments"));
const Evolution = lazy(() => import("@/pages/Evolution"));
const TrainingDashboard = lazy(() => import("@/pages/TrainingDashboard"));
const Zotero = lazy(() => import("@/pages/Zotero"));
const Plugins = lazy(() => import("@/pages/Plugins"));
const PluginRun = lazy(() => import("@/pages/PluginRun"));
const Connectors = lazy(() => import("@/pages/Connectors"));
const Sources = lazy(() => import("@/pages/Sources"));
const Memory = lazy(() => import("@/pages/Memory"));
const Skills = lazy(() => import("@/pages/Skills"));
const NanoResearch = lazy(() => import("@/pages/NanoResearch"));
const Nodes = lazy(() => import("@/pages/Nodes"));
const Datasets = lazy(() => import("@/pages/Datasets"));
const MCPManager = lazy(() => import("@/pages/MCPManager"));
const NetworkHome = lazy(() => import("@/pages/network/NetworkHome"));
const NetworkOutcomes = lazy(() => import("@/pages/network/Outcomes"));
const NetworkCreditLines = lazy(() => import("@/pages/network/CreditLines"));
const NetworkReputations = lazy(() => import("@/pages/network/Reputations"));
const NetworkPools = lazy(() => import("@/pages/network/Pools"));
const NetworkStakes = lazy(() => import("@/pages/network/Stakes"));
const NetworkJobs = lazy(() => import("@/pages/network/Jobs"));
const NetworkHealth = lazy(() => import("@/pages/network/Health"));
const Schedules = lazy(() => import("@/pages/Schedules"));
const Health = lazy(() => import("@/pages/Health"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <>
      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route
              index
              element={
                <Suspense fallback={<PageFallback />}>
                  <Home />
                </Suspense>
              }
            />
            <Route
              path="search"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Search />
                </Suspense>
              }
            />
            <Route
              path="library"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Library />
                </Suspense>
              }
            />
            <Route
              path="library/:corpusId"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Document />
                </Suspense>
              }
            />
            <Route
              path="graph/:corpusId"
              element={
                <Suspense fallback={<PageFallback />}>
                  <GraphView />
                </Suspense>
              }
            />
            <Route
              path="book/:bookId"
              element={
                <Suspense fallback={<PageFallback />}>
                  <BookWorkspace />
                </Suspense>
              }
            />
            <Route
              path="research/:taskId"
              element={
                <Suspense fallback={<PageFallback />}>
                  <ResearchView />
                </Suspense>
              }
            />
            <Route
              path="experiments"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Experiments />
                </Suspense>
              }
            />
            <Route
              path="experiments/dashboard"
              element={
                <Suspense fallback={<PageFallback />}>
                  <TrainingDashboard />
                </Suspense>
              }
            />
            <Route
              path="evolution"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Evolution />
                </Suspense>
              }
            />
            <Route
              path="zotero"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Zotero />
                </Suspense>
              }
            />
            <Route
              path="plugins"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Plugins />
                </Suspense>
              }
            />
            <Route
              path="plugins/:pluginId"
              element={
                <Suspense fallback={<PageFallback />}>
                  <PluginRun />
                </Suspense>
              }
            />
            <Route
              path="connectors"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Connectors />
                </Suspense>
              }
            />
            <Route
              path="sources"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Sources />
                </Suspense>
              }
            />
            <Route
              path="memory"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Memory />
                </Suspense>
              }
            />
            <Route
              path="skills"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Skills />
                </Suspense>
              }
            />
            <Route
              path="nano"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NanoResearch />
                </Suspense>
              }
            />
            <Route
              path="nodes"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Nodes />
                </Suspense>
              }
            />
            <Route
              path="datasets"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Datasets />
                </Suspense>
              }
            />
            <Route
              path="mcp"
              element={
                <Suspense fallback={<PageFallback />}>
                  <MCPManager />
                </Suspense>
              }
            />
            <Route
              path="network"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NetworkHome />
                </Suspense>
              }
            />
            <Route
              path="network/outcomes"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NetworkOutcomes />
                </Suspense>
              }
            />
            <Route
              path="network/credit-lines"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NetworkCreditLines />
                </Suspense>
              }
            />
            <Route
              path="network/reputations"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NetworkReputations />
                </Suspense>
              }
            />
            <Route
              path="network/pools"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NetworkPools />
                </Suspense>
              }
            />
            <Route
              path="network/stakes"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NetworkStakes />
                </Suspense>
              }
            />
            <Route
              path="network/jobs"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NetworkJobs />
                </Suspense>
              }
            />
            <Route
              path="network/health"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NetworkHealth />
                </Suspense>
              }
            />
            <Route
              path="schedules"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Schedules />
                </Suspense>
              }
            />
            <Route
              path="health"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Health />
                </Suspense>
              }
            />
            <Route
              path="settings"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Settings />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={
                <Suspense fallback={<PageFallback />}>
                  <NotFound />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </ErrorBoundary>
      {/*
        CommandPalette lives outside the ErrorBoundary so it remains
        operable even if the active route crashes — the user can press
        Cmd+K and navigate away from the broken view.
      */}
      <CommandPalette />
    </>
  );
}
