import { canAdvertising } from '@/lib/advertising/permissions';
import { isFeatureEnabled } from '@/lib/brandkit/featureFlags';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getAppBranding, brandingCssVariables } from '@/lib/settings/appSettings';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/Toaster';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/giris');

  const branding = await getAppBranding(session.user.workspaceId);
  const cssVars = brandingCssVariables(branding);

  return (
    <div style={cssVars as React.CSSProperties}>
      <ToastProvider>
        <AppShell
          inboxEnabled={isFeatureEnabled('unifiedInbox')}
          catalogEnabled={isFeatureEnabled('productCatalog')}
          advertisingEnabled={isFeatureEnabled('paidMedia') && canAdvertising(session.user.role, 'ads:view')}
          user={{
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            role: session.user.role,
            workspaceName: session.user.workspaceName
          }}
          branding={{
            appName: branding.appName,
            logoMark: branding.logoMark,
            logoUrl: branding.logoUrl,
            primaryColor: branding.primaryColor,
            demoMode: branding.demoMode,
            demoBanner: branding.demoBanner,
            aiProvider: branding.aiProvider
          }}
        >
          {children}
        </AppShell>
      </ToastProvider>
    </div>
  );
}

