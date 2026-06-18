import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated } from '@/utils/storage'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/HomePage.vue'),
    },
    {
      path: '/analyze/:reportId',
      name: 'analyze',
      component: () => import('@/pages/AnalyzePage.vue'),
    },
    {
      path: '/report/:reportId',
      name: 'report',
      component: () => import('@/pages/ReportPage.vue'),
    },
    {
      path: '/admin/login',
      name: 'admin-login',
      component: () => import('@/pages/admin/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('@/pages/admin/DashboardPage.vue'),
        },
        {
          path: 'settings/ai',
          name: 'admin-settings-ai',
          component: () => import('@/pages/admin/AiSettingsPage.vue'),
        },
        {
          path: 'settings/system',
          name: 'admin-settings-system',
          component: () => import('@/pages/admin/SystemSettingsPage.vue'),
        },
        {
          path: 'prompts',
          name: 'admin-prompts',
          component: () => import('@/pages/admin/PromptTemplatesPage.vue'),
        },
        {
          path: 'reports',
          name: 'admin-reports',
          component: () => import('@/pages/admin/ReportsPage.vue'),
        },
        {
          path: 'reports/:id',
          name: 'admin-report-detail',
          component: () => import('@/pages/admin/ReportDetailPage.vue'),
        },
        {
          path: 'logs',
          name: 'admin-logs',
          component: () => import('@/pages/admin/LogsPage.vue'),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/pages/NotFoundPage.vue'),
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const needsAuth = to.matched.some((r) => r.meta.requiresAuth)
  const isGuest = to.meta.guest

  if (needsAuth && !isAuthenticated()) {
    next({ name: 'admin-login', query: { redirect: to.fullPath } })
  } else if (isGuest && isAuthenticated()) {
    next({ name: 'admin-dashboard' })
  } else {
    next()
  }
})

export default router
