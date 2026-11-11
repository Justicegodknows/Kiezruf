// Posting: checks before sign-in, the upload sequence and the POST /reports body (US-06, US-08, US-10, US-11).
import { EMPTY_DRAFT, type Draft } from '../src/report/DraftProvider';
import { draftProblem, putFile, reportBody, submitDraft } from '../src/report/submit';
import { mockApi } from '../src/testing/helpers';

const capturedAt = new Date('2026-11-11T12:00:00Z');
const photo = (n: number) => ({
  id: `p${n}`,
  uri: `file:///p${n}.jpg`,
  width: 4000,
  height: 3000,
  capture: { lat: 52.4795, lon: 13.4365, accuracyM: 12, capturedAt },
  source: 'camera' as const,
});
const draft = (over: Partial<Draft> = {}): Draft => ({
  ...EMPTY_DRAFT,
  photos: [photo(1)],
  category: 'traffic_light',
  route: { tenantName: 'Neukölln', office: 'Bezirksamt Neukölln' },
  ...over,
});

test('draftProblem: photos, category, and a description for "Other"', () => {
  expect(draftProblem(draft({ photos: [] }))).toBe('no_photos');
  expect(draftProblem(draft({ category: null }))).toBe('no_category');
  expect(draftProblem(draft({ category: 'community_other', description: '  ' }))).toBe('description_required');
  expect(draftProblem(draft({ category: 'community_other', description: 'Sofa am Gehweg' }))).toBeNull();
  expect(draftProblem(draft())).toBeNull();
});

test('reportBody uses the first photo as capture, trims the description and adds the pin only when moved', () => {
  expect(reportBody(draft({ description: '  dunkel  ', dangerous: true }), ['k1'])).toEqual({
    category: 'traffic_light',
    description: 'dunkel',
    dangerous: true,
    capture: { lat: 52.4795, lon: 13.4365, accuracyM: 12, capturedAt: '2026-11-11T12:00:00.000Z' },
    photoKeys: ['k1'],
  });
  const body = reportBody(draft({ pin: { lat: 52.4797, lon: 13.4365 } }), ['k1']);
  expect(body.pin).toEqual({ lat: 52.4797, lon: 13.4365 });
  expect(body).not.toHaveProperty('description');
});

test('submitDraft resizes, uploads each photo, then posts with the keys', async () => {
  const order: string[] = [];
  const progress: unknown[] = [];
  let n = 0;
  const posted = await submitDraft(draft({ photos: [photo(1), photo(2)] }), (p) => progress.push(p), {
    resize: async (p) => {
      order.push(`resize ${p.id}`);
      return `file:///small-${p.id}.jpg`;
    },
    createUpload: async (type) => {
      order.push(`upload ${type}`);
      n += 1;
      return { key: `originals/a/${n}.jpg`, url: `https://s3/${n}`, method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } };
    },
    putFile: async (ticket, uri) => void order.push(`put ${ticket.url} ${uri}`),
    postReport: async (body) => {
      order.push(`post ${body.photoKeys.join(',')}`);
      return { publicId: 'BE-NK-2026-0119', status: 'processing', tenant: { name: 'Neukölln', office: 'Bezirksamt Neukölln' } };
    },
  });
  expect(order).toEqual([
    'resize p1',
    'upload image/jpeg',
    'put https://s3/1 file:///small-p1.jpg',
    'resize p2',
    'upload image/jpeg',
    'put https://s3/2 file:///small-p2.jpg',
    'post originals/a/1.jpg,originals/a/2.jpg',
  ]);
  expect(progress).toEqual([{ step: 'upload', n: 1, total: 2 }, { step: 'upload', n: 2, total: 2 }, { step: 'post' }]);
  expect(posted.publicId).toBe('BE-NK-2026-0119');
});

test('putFile sends the file with the presigned headers and fails clearly on a bad answer', async () => {
  const calls = mockApi({ 'PUT /bucket/key': { status: 200 } });
  await putFile({ key: 'k', url: 'https://s3.test/bucket/key', method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } }, 'file:///x.jpg');
  const put = calls.find((c) => c.method === 'PUT')!;
  expect(put.headers).toEqual({ 'Content-Type': 'image/jpeg' });

  mockApi({ 'PUT /bucket/key': { status: 403 } });
  await expect(putFile({ key: 'k', url: 'https://s3.test/bucket/key', method: 'PUT', headers: {} }, 'file:///x.jpg')).rejects.toMatchObject({
    code: 'upload_failed',
  });
});
