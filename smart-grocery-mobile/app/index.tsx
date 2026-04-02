import { Redirect } from 'expo-router';

import LoadingScreen from '../src/components/LoadingScreen';
import { useAuth } from '../src/context/AuthContext';
import { getHomeRouteForRole } from '../src/utils/roles';

export default function Index() {
  const { loading, isAuthenticated, user } = useAuth();

  if (loading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  return <Redirect href={isAuthenticated ? getHomeRouteForRole(user?.role) : '/login'} />;
}
