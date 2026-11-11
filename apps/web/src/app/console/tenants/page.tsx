import { TenantsPage } from '@/console/pages/TenantsPage';
import { RequireStaff } from '@/console/StaffProvider';

// Tenants & roles (US-40, US-42, US-46).
export default function ConsoleTenantsPage() {
  return (
    <RequireStaff>
      <TenantsPage />
    </RequireStaff>
  );
}
