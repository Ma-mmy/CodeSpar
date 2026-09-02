import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { ModelsPage } from '@/pages/models/ModelsPage'
import { GeneratePage } from '@/pages/generate/GeneratePage'
import { GenerateRunPage } from '@/pages/generate/GenerateRunPage'
import { ExamsPage } from '@/pages/exams/ExamsPage'
import { TakeExamPage } from '@/pages/exams/TakeExamPage'
import { ReportPage } from '@/pages/exams/ReportPage'
import { GenerationsHistoryPage } from '@/pages/history/GenerationsHistoryPage'
import { GradingsHistoryPage } from '@/pages/history/GradingsHistoryPage'
import { ArticlesPage } from '@/pages/articles/ArticlesPage'
import { SettingsLayout } from '@/pages/settings/SettingsPage'
import { PromptsSettingsPage } from '@/pages/settings/PromptsSettingsPage'
import { CategoriesSettingsPage } from '@/pages/settings/CategoriesSettingsPage'
import { Placeholder } from '@/pages/Placeholder'
import { UiGallery } from '@/pages/UiGallery'
import { ToastProvider, TooltipProvider } from '@/components/ui'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="models" element={<Navigate to="/settings/models" replace />} />
                <Route path="settings" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="models" replace />} />
                  <Route path="models" element={<ModelsPage embedded />} />
                  <Route path="prompts" element={<PromptsSettingsPage />} />
                  <Route path="categories" element={<CategoriesSettingsPage />} />
                </Route>
                <Route path="articles" element={<ArticlesPage />} />
                <Route path="generate" element={<GeneratePage />} />
                <Route path="generate/:jobId" element={<GenerateRunPage />} />
                <Route path="exams" element={<ExamsPage />} />
                <Route path="exams/:id/take" element={<TakeExamPage />} />
                <Route path="exams/:id/report" element={<ReportPage />} />
                <Route path="history/generations" element={<GenerationsHistoryPage />} />
                <Route path="history/gradings" element={<GradingsHistoryPage />} />
                {/* 组件总览：开发用，不进导航栏 */}
                <Route path="_ui" element={<UiGallery />} />
                <Route path="*" element={<Placeholder title="页面不存在" phase="—" />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
