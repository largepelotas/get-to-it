import { Toaster as Sonner } from 'sonner';
import { useResolvedTheme } from '@/hooks/useTheme';

export function Toaster() {
  const theme = useResolvedTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      duration={5000}
      toastOptions={{
        style: {
          background: 'var(--elevated)',
          color: 'var(--fg)',
          borderColor: 'var(--line)',
          fontSize: '13px',
        },
      }}
    />
  );
}
