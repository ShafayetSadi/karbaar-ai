import { HomePage } from './home/HomePage';
import { NavigationGuards } from './navigation/LeaveGuard';
import { Navigate, Route, Routes } from 'react-router-dom';
import { CatchAllRedirect, RequireAuth } from './auth/RequireAuth';
import { AppLayout, PageContainer } from './components/AppLayout';
import { ToastProvider, TooltipProvider } from './components/ui';
import { ThemeProvider } from './theme/ThemeProvider';
import { InboxPage } from './inbox/InboxPage';
import { NewOrderPage } from './orders/NewOrderPage';
import { OrderDetailPage } from './orders/OrderDetailPage';
import { OrdersPage } from './orders/OrdersPage';
import { ProductEditor } from './products/ProductEditor';
import { ProductsPage } from './products/ProductsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <ToastProvider>
          <NavigationGuards>
            <AppRoutes />
          </NavigationGuards>
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          {/* Full-bleed: the inbox's panes fill the main area and scroll on their own. */}
          <Route path="/inbox" element={<InboxPage />} />
          {/* List pages: their tables use the extra width. */}
          <Route element={<PageContainer wide />}>
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/new" element={<ProductEditor />} />
            <Route path="/products/:productId" element={<ProductEditor />} />
            <Route path="/settings/:section?" element={<SettingsPage />} />
          </Route>
          <Route element={<PageContainer />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/orders/new" element={<NewOrderPage />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/login" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<CatchAllRedirect />} />
    </Routes>
  );
}
