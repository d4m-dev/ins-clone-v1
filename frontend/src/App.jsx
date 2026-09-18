/**
 * src/App.jsx — routing table.
 * Protected routes redirect to /login and remember where the user wanted to go.
 */

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ROUTES } from '../config/urls.js';
import { useAuth } from './context/AuthContext.jsx';
import FeedPage from './pages/FeedPage.jsx';
import ExplorePage from './pages/ExplorePage.jsx';
import ReelsPage from './pages/ReelsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import PostPage from './pages/PostPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { Spinner } from './components/States.jsx';

function RequireAuth({ children }) {
  const { isAuthenticated, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) return <Spinner />;
  if (!isAuthenticated) return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path={ROUTES.feed} element={<FeedPage />} />
      <Route path={ROUTES.explore} element={<ExplorePage />} />
      <Route path={ROUTES.reels} element={<ReelsPage />} />
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route path={ROUTES.register} element={<RegisterPage />} />

      {/* Hai trang này KHÔNG cần đăng nhập: người quên mật khẩu thì không có phiên.
          Link trong email trỏ thẳng tới đây (xem backend/services/mailer.service.js). */}
      <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
      <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />
      <Route path="/p/:id" element={<PostPage />} />

      <Route
        path={ROUTES.upload}
        element={
          <RequireAuth>
            <UploadPage />
          </RequireAuth>
        }
      />
      <Route
        path="/u/:username"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
