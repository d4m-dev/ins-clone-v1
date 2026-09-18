import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/urls.js';
import Layout from '../components/Layout.jsx';
import { EmptyState } from '../components/States.jsx';
import { useI18n } from '../i18n/index.js';

export default function NotFoundPage() {
  const { t } = useI18n();

  return (
    <Layout>
      <EmptyState
        icon="🧭"
        title={t('notFound.title')}
        description={t('notFound.description')}
        action={
          <Link to={ROUTES.feed} className="ig-button w-auto px-6">
            {t('notFound.action')}
          </Link>
        }
      />
    </Layout>
  );
}
