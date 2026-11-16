import { ModerationPage } from '@/console/pages/ModerationPage';
import { RequireStaff } from '@/console/StaffProvider';

// Flagged & moderation (US-26, US-33, US-37).
export default function ConsoleModerationPage() {
  return (
    <RequireStaff>
      <ModerationPage />
    </RequireStaff>
  );
}
