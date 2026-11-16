import { Suspense } from 'react';
import { SignInPage } from '@/console/pages/SignInPage';

// Staff sign-in: email and password, then TOTP (first time: enrolment with a QR code).
export default function ConsoleSignInPage() {
  return (
    <Suspense>
      <SignInPage />
    </Suspense>
  );
}
