import { AppProvider } from '@/components/app-provider';
import { Shell } from '@/components/shell';
import { Gudi } from '@/components/gudi';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
      <Gudi />
    </AppProvider>
  );
}
