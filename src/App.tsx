import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "./pages/LandingPage";
import AuthPage, { JobSeekerAuthPage, EmployerAuthPage } from "./pages/AuthPage";
import RequireAuth from "./components/RequireAuth";
import RequireTrack from "./components/RequireTrack";
import ProfileInputPage from "./pages/ProfileInputPage";
import SkillsSignalPage from "./pages/SkillsSignalPage";
import RiskLensPage from "./pages/RiskLensPage";
import OpportunityMatchPage from "./pages/OpportunityMatchPage";
import YouthDashboardPage from "./pages/YouthDashboardPage";
import PolicymakerDashboardPage from "./pages/PolicymakerDashboardPage";
import TalentPoolPage from "./pages/TalentPoolPage";
import RecruitPage from "./pages/RecruitPage";
import DevNavOverlay from "./components/DevNavOverlay";
import CountryConfigPage from "./pages/CountryConfigPage";
import HeatmapPage from "./pages/HeatmapPage";
import GrowPage from "./pages/GrowPage";
import SharedPortfolioPage from "./pages/SharedPortfolioPage";
import NotFound from "./pages/NotFound.tsx";
import GoToLandingButton from "./components/GoToLandingButton";
import RouteIndicator from "./components/RouteIndicator";
import { AuthProvider } from "@/hooks/useAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <BrowserRouter>
          <GoToLandingButton />
          <RouteIndicator />
          <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/job-seeker" element={<JobSeekerAuthPage />} />
          <Route path="/auth/employer" element={<EmployerAuthPage />} />
          <Route path="/share/portfolio/:slug" element={<SharedPortfolioPage />} />

          {/* App — requires sign-in */}
          <Route path="/app" element={<RequireAuth><Navigate to="/app/risk" replace /></RequireAuth>} />
          <Route path="/app/profile" element={<RequireAuth><RequireTrack allow="individual"><ProfileInputPage /></RequireTrack></RequireAuth>} />
          <Route path="/app/skills" element={<RequireAuth><RequireTrack allow="individual"><SkillsSignalPage /></RequireTrack></RequireAuth>} />
          <Route path="/app/risk" element={<RequireAuth><RiskLensPage /></RequireAuth>} />
          <Route path="/app/match" element={<RequireAuth><RequireTrack allow="individual"><OpportunityMatchPage /></RequireTrack></RequireAuth>} />
          <Route path="/app/youth" element={<RequireAuth><RequireTrack allow="individual"><YouthDashboardPage /></RequireTrack></RequireAuth>} />
          <Route path="/app/policy" element={<RequireAuth><RequireTrack allow="policymaker"><PolicymakerDashboardPage /></RequireTrack></RequireAuth>} />
          <Route path="/app/config" element={<RequireAuth><CountryConfigPage /></RequireAuth>} />
          <Route path="/app/heatmap" element={<RequireAuth><RequireTrack allow="policymaker"><HeatmapPage /></RequireTrack></RequireAuth>} />
          <Route path="/app/talent" element={<RequireAuth><RequireTrack allow="policymaker"><TalentPoolPage /></RequireTrack></RequireAuth>} />
          <Route path="/app/recruit" element={<RequireAuth><RequireTrack allow="policymaker"><RecruitPage /></RequireTrack></RequireAuth>} />
          <Route path="/talent" element={<Navigate to="/app/talent" replace />} />
          <Route path="/app/grow" element={<RequireAuth><RequireTrack allow="individual"><GrowPage /></RequireTrack></RequireAuth>} />

          {/* Back-compat: forward old top-level routes to /app/* so existing
              bookmarks and in-app links keep working without changing every page. */}
          <Route path="/profile" element={<Navigate to="/app/profile" replace />} />
          <Route path="/skills" element={<Navigate to="/app/skills" replace />} />
          <Route path="/risk" element={<Navigate to="/app/risk" replace />} />
          <Route path="/match" element={<Navigate to="/app/match" replace />} />
          <Route path="/youth" element={<Navigate to="/app/youth" replace />} />
          <Route path="/policy" element={<Navigate to="/app/policy" replace />} />
          <Route path="/config" element={<Navigate to="/app/config" replace />} />
          <Route path="/heatmap" element={<Navigate to="/app/heatmap" replace />} />

          <Route path="*" element={<NotFound />} />
          </Routes>
          {/* DevNavOverlay self-removes in production builds. */}
          <DevNavOverlay />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
