// One function per API endpoint the citizen app uses (README "API (citizen core)").
import { api } from './client';
import {
  Comments,
  FollowedReports,
  Me,
  MeTooResult,
  MyReports,
  NearbyReports,
  NotificationSettings,
  PostedComment,
  PostedReport,
  ReportDetail,
  ReportRelation,
  RouteResult,
  Session,
  UploadTicket,
} from './schemas';

export type Locale = 'de' | 'en';
export interface Point {
  lat: number;
  lon: number;
}
export interface PositionFix extends Point {
  accuracyM: number;
}

const enc = encodeURIComponent;

// --- sign-in (US-01) ---
export const requestCode = (email: string, locale: Locale) => api('POST', '/auth/code', { body: { email, locale } });
export const verifyCode = (email: string, code: string, locale: Locale) =>
  api('POST', '/auth/verify', { body: { email, code, locale }, schema: Session });
export const logout = () => api('POST', '/auth/logout');
export const getMe = () => api('GET', '/me', { schema: Me });
export const updateMe = (patch: { locale: Locale }) => api('PATCH', '/me', { body: patch });
export const deleteMe = () => api('DELETE', '/me');

// --- browsing (US-15, US-24, US-41, US-44) ---
export const routeAt = (p: Point) => api('GET', '/public/route', { query: { lat: p.lat, lon: p.lon }, schema: RouteResult });
/** The camera's check: like routeAt, but a not-live answer counts as an attempted report (US-44). */
export const reportAttemptAt = (p: Point) =>
  api('POST', '/public/report-attempts', { body: { lat: p.lat, lon: p.lon }, schema: RouteResult });

export interface NearbyFilters {
  category?: string;
  status?: string;
  maxAgeDays?: number;
}
export const nearbyReports = (p: Point, radiusM: number, filters: NearbyFilters = {}) =>
  api('GET', '/public/reports', { query: { lat: p.lat, lon: p.lon, radiusM, ...filters }, schema: NearbyReports });
export const reportDetail = (publicId: string) => api('GET', `/public/reports/${enc(publicId)}`, { schema: ReportDetail });

// --- posting (US-03, US-06, US-08 to US-11) ---
export type UploadContentType = 'image/jpeg' | 'image/png' | 'image/heic';
export const createUpload = (contentType: UploadContentType) => api('POST', '/uploads', { body: { contentType }, schema: UploadTicket });

export interface PostReportBody {
  category: string;
  description?: string;
  dangerous: boolean;
  capture: { lat: number; lon: number; accuracyM: number | null; capturedAt: string | null };
  pin?: Point;
  photoKeys: string[];
}
export const postReport = (body: PostReportBody) => api('POST', '/reports', { body, schema: PostedReport });
export const myReports = () => api('GET', '/me/reports', { schema: MyReports });

// --- engagement (US-18, US-19, US-20) ---
export const reportRelation = (publicId: string) => api('GET', `/reports/${enc(publicId)}/me`, { schema: ReportRelation });
export const addMeToo = (publicId: string, at: PositionFix) =>
  api('PUT', `/reports/${enc(publicId)}/me-too`, { body: at, schema: MeTooResult });
export const removeMeToo = (publicId: string) => api('DELETE', `/reports/${enc(publicId)}/me-too`, { schema: MeTooResult });
export const comments = (publicId: string) => api('GET', `/public/reports/${enc(publicId)}/comments`, { schema: Comments });
export const addComment = (publicId: string, body: string) =>
  api('POST', `/reports/${enc(publicId)}/comments`, { body: { body }, schema: PostedComment });
export const flagComment = (commentId: string) => api('POST', `/comments/${enc(commentId)}/flag`, { body: {} });
export const follow = (publicId: string) => api('PUT', `/reports/${enc(publicId)}/follow`);
export const unfollow = (publicId: string) => api('DELETE', `/reports/${enc(publicId)}/follow`);
export const myFollows = () => api('GET', '/me/follows', { schema: FollowedReports });

// --- notifications (US-29, US-44) ---
export const registerPushToken = (token: string, platform: 'ios' | 'android') =>
  api('PUT', '/me/push-token', { body: { token, platform } });
export const removePushToken = (token: string) => api('DELETE', '/me/push-token', { body: { token } });
export const notificationSettings = () => api('GET', '/me/notification-settings', { schema: NotificationSettings });
export const saveNotificationSettings = (settings: NotificationSettings) =>
  api('PUT', '/me/notification-settings', { body: settings });
export const goLiveAlert = (p: Point) => api('POST', '/go-live-alerts', { body: { lat: p.lat, lon: p.lon } });
