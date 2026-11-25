import { useRouter } from 'expo-router';

import LibraryScreen from './library';

export default function FindScreen() {
  const router = useRouter();

  return <LibraryScreen initialAddBookOpen onAddBookClose={() => router.replace('/library')} />;
}
