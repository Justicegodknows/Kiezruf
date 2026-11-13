// Report detail (US-18, US-19, US-20): photos, status, Me too with the public count, comments with flag,
// follow. Browsing needs no account; voting, commenting, flagging and following open the sign-in sheet once.
import { MAX_ACCURACY_M } from '@kiezruf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../../api/client';
import {
  addComment,
  addMeToo,
  comments as fetchComments,
  flagComment,
  follow,
  myReports,
  removeMeToo,
  reportDetail,
  reportRelation,
  unfollow,
} from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import type { ReportDetail, ReportRelation } from '../../api/schemas';
import { useAuth } from '../../auth/AuthProvider';
import { ageLabel, categoryName } from '../../lib/format';
import { currentFix } from '../../lib/location';
import { Banner, Button, ErrorText, SectionTitle } from '../../ui/components';
import { StatusStepper } from '../../ui/StatusStepper';
import { colors, radius, space, TOUCH } from '../../ui/theme';

/** Comments are limited to 500 characters (US-19). */
const MAX_COMMENT = 500;

export default function ReportDetailScreen() {
  // coReported: opened right after "Add my photo to this report" (US-13).
  const { publicId, coReported } = useLocalSearchParams<{ publicId: string; coReported?: string }>();
  const { t } = useTranslation();
  const { signedIn, requireSignIn } = useAuth();
  const queryClient = useQueryClient();

  const detail = useQuery({ queryKey: ['report', publicId], queryFn: () => reportDetail(publicId) });
  const relation = useQuery({ queryKey: ['me', 'relation', publicId], queryFn: () => reportRelation(publicId), enabled: signedIn });
  const notPublic = detail.error instanceof ApiError && detail.error.code === 'not_found';
  const mine = useQuery({ queryKey: ['me', 'reports'], queryFn: myReports, enabled: signedIn && notPublic });
  const comments = useQuery({ queryKey: ['comments', publicId], queryFn: () => fetchComments(publicId), enabled: detail.isSuccess });

  const [voteError, setVoteError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentNote, setCommentNote] = useState<{ tone: 'success' | 'info'; text: string } | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});

  const setRelation = (patch: Partial<ReportRelation>) =>
    queryClient.setQueryData<ReportRelation>(['me', 'relation', publicId], (r) => ({ following: false, meToo: false, mine: false, ...r, ...patch }));

  const vote = useMutation({
    mutationFn: async (undo: boolean) => {
      if (undo) return removeMeToo(publicId);
      // Me too counts only on site (D-03): one fresh foreground fix, at the moment of voting.
      const fix = await currentFix();
      if (fix.accuracyM === null || fix.accuracyM > MAX_ACCURACY_M) throw new ApiError(422, 'accuracy_too_low');
      return addMeToo(publicId, { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM });
    },
    onMutate: () => setVoteError(null),
    onSuccess: (result) => {
      queryClient.setQueryData<ReportDetail>(['report', publicId], (d) => (d ? { ...d, meTooCount: result.meTooCount } : d));
      // Voting follows automatically (US-20); undoing a vote does not unfollow.
      setRelation(result.voted ? { meToo: true, following: true } : { meToo: false });
      // A relation request started at sign-in may still be in flight with the old state; ask again.
      void queryClient.invalidateQueries({ queryKey: ['me', 'relation', publicId] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'follows'] });
    },
    onError: (e) => setVoteError(errorMessage(t, e)),
  });

  const followToggle = useMutation({
    mutationFn: async (on: boolean) => (on ? follow(publicId) : unfollow(publicId)),
    onSuccess: (_r, on) => {
      setRelation({ following: on });
      void queryClient.invalidateQueries({ queryKey: ['me', 'relation', publicId] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'follows'] });
    },
  });

  const postComment = useMutation({
    mutationFn: (body: string) => addComment(publicId, body),
    onMutate: () => {
      setCommentError(null);
      setCommentNote(null);
    },
    onSuccess: (result) => {
      setCommentText('');
      setCommentNote(result.held ? { tone: 'info', text: t('detail.commentHeld') } : { tone: 'success', text: t('detail.commentPosted') });
      void queryClient.invalidateQueries({ queryKey: ['comments', publicId] });
    },
    onError: (e) => setCommentError(errorMessage(t, e)),
  });

  const flag = useMutation({
    mutationFn: (id: string) => flagComment(id),
    onSuccess: (_r, id) => setFlagged((f) => ({ ...f, [id]: true })),
    onError: (e) => setCommentError(errorMessage(t, e)),
  });

  if (detail.isPending) return <Centered text={t('common.loading')} />;
  if (detail.isError) {
    const own = mine.data?.reports.find((r) => r.publicId === publicId);
    if (own) {
      return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.id}>{publicId}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {categoryName(t, own.category)}
          </Text>
          <Banner tone="info" testID="detail-processing">
            {t('detail.processing')}
          </Banner>
        </ScrollView>
      );
    }
    return (
      <View style={styles.centered}>
        <ErrorText message={notPublic ? t('detail.notFound') : errorMessage(t, detail.error)} testID="detail-error" />
        {notPublic ? null : <Button label={t('common.retry')} onPress={() => void detail.refetch()} />}
      </View>
    );
  }

  const report = detail.data;
  const voted = relation.data?.meToo ?? false;
  const following = relation.data?.following ?? false;
  const others = Math.max(0, report.meTooCount - (voted ? 1 : 0));

  const onVote = () => requireSignIn('vote', () => vote.mutate(voted));
  const onFollow = () => requireSignIn('follow', () => followToggle.mutate(!following));
  const onComment = () => {
    const body = commentText.trim();
    if (!body) return;
    requireSignIn('comment', () => postComment.mutate(body));
  };
  const onFlag = (id: string) =>
    requireSignIn('continue', () =>
      Alert.alert(t('detail.flagConfirmTitle'), t('detail.flagConfirmBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('detail.flag'), style: 'destructive', onPress: () => flag.mutate(id) },
      ]),
    );

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="detail-screen">
      {coReported === '1' ? (
        <Banner tone="success" testID="detail-co-reported">
          {t('detail.coReported')}
        </Banner>
      ) : null}
      {report.photos.length ? (
        <ScrollView horizontal pagingEnabled style={styles.photos}>
          {report.photos.map((p, i) => (
            <Image
              key={p.url}
              source={{ uri: p.url }}
              style={styles.photo}
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('detail.photo', { n: i + 1, total: report.photos.length })}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <Text style={styles.muted}>{t('detail.noPhoto')}</Text>
        </View>
      )}

      <Text style={styles.id} testID="detail-id">
        {report.publicId}
      </Text>
      <Text accessibilityRole="header" style={styles.title}>
        {categoryName(t, report.category)}
      </Text>
      <Text style={styles.muted}>{[t(`status.${report.status}`), ageLabel(t, report.createdAt)].join(' · ')}</Text>
      {report.dangerous ? <Text style={styles.danger}>{`⚠ ${t('detail.dangerous')}`}</Text> : null}

      <StatusStepper status={report.status} />
      {report.status === 'forwarded' ? (
        <Banner tone="neutral" testID="detail-forwarded">
          <Text style={styles.bold}>{t('status.forwarded')}</Text>
          <Text style={styles.body}>{report.publicNote ?? t('detail.forwardedNote')}</Text>
        </Banner>
      ) : report.publicNote ? (
        <Banner tone="neutral" testID="detail-office-note">
          <Text style={styles.bold}>{t('detail.officeNote')}</Text>
          <Text style={styles.body}>{report.publicNote}</Text>
        </Banner>
      ) : null}
      {report.office ? <Text style={styles.body}>{t('detail.office', { office: report.office })}</Text> : null}
      {report.description ? <Text style={styles.body}>{report.description}</Text> : null}

      <Button
        testID="detail-metoo"
        variant={voted ? 'secondary' : 'primary'}
        icon={voted ? '✓' : '✋'}
        label={voted ? t('detail.meTooVoted', { count: others }) : t('detail.meToo', { count: report.meTooCount })}
        accessibilityLabel={voted ? t('detail.meTooVotedA11y', { count: others }) : t('detail.meTooA11y', { count: report.meTooCount })}
        accessibilityHint={t('detail.meTooHint')}
        onPress={onVote}
        busy={vote.isPending}
      />
      {vote.isPending && !voted ? <Text style={styles.muted}>{t('detail.locating')}</Text> : null}
      <ErrorText message={voteError} testID="detail-metoo-error" />

      <Button
        testID="detail-follow"
        variant="secondary"
        icon={following ? '✓' : '🔔'}
        label={following ? t('detail.following') : t('detail.follow')}
        accessibilityLabel={following ? t('detail.followingA11y') : t('detail.followA11y')}
        onPress={onFollow}
        busy={followToggle.isPending}
      />
      {followToggle.isError ? <ErrorText message={errorMessage(t, followToggle.error)} /> : null}

      <SectionTitle>{t('detail.comments')}</SectionTitle>
      {comments.data?.comments.length === 0 ? <Text style={styles.muted}>{t('detail.noComments')}</Text> : null}
      {comments.isError ? <ErrorText message={errorMessage(t, comments.error)} /> : null}
      <View style={styles.gap} testID="detail-comments">
        {comments.data?.comments.map((c) => (
          <View key={c.id} style={styles.comment} testID={`comment-${c.id}`}>
            <View style={styles.grow}>
              <Text style={styles.body}>{c.body}</Text>
              <Text style={styles.small}>{ageLabel(t, c.createdAt)}</Text>
            </View>
            {flagged[c.id] ? (
              <Text style={styles.small}>{t('detail.flagged')}</Text>
            ) : (
              <Pressable
                testID={`comment-flag-${c.id}`}
                onPress={() => onFlag(c.id)}
                accessibilityRole="button"
                accessibilityLabel={t('detail.flagA11y')}
                style={styles.flag}
              >
                <Text style={styles.flagText}>{`⚑ ${t('detail.flag')}`}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <Text style={styles.label} nativeID="comment-label">
        {t('detail.commentLabel')}
      </Text>
      <TextInput
        testID="comment-input"
        value={commentText}
        onChangeText={setCommentText}
        maxLength={MAX_COMMENT}
        multiline
        placeholder={t('detail.commentPlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('detail.commentLabel')}
        accessibilityLabelledBy="comment-label"
        style={styles.input}
      />
      <Text style={styles.small} testID="comment-count">
        {t('detail.charsLeft', { count: MAX_COMMENT - commentText.length })}
      </Text>
      <Button
        testID="comment-send"
        variant="primary"
        label={t('detail.commentSend')}
        onPress={onComment}
        disabled={commentText.trim() === ''}
        busy={postComment.isPending}
      />
      <ErrorText message={commentError} testID="comment-error" />
      {commentNote ? (
        <Banner tone={commentNote.tone} testID="comment-note">
          {commentNote.text}
        </Banner>
      ) : null}
    </ScrollView>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, gap: space.m, paddingBottom: space.xl * 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.m },
  photos: { borderRadius: radius.m },
  photo: { width: 320, height: 220, borderRadius: radius.m, marginRight: space.s, backgroundColor: colors.sunk },
  noPhoto: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  id: { fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'] },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  small: { fontSize: 13, color: colors.muted },
  body: { fontSize: 16, color: colors.text },
  bold: { fontSize: 16, fontWeight: '700', color: colors.text },
  danger: { fontSize: 15, fontWeight: '700', color: colors.danger },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  gap: { gap: space.s },
  grow: { flex: 1, gap: space.xs },
  comment: {
    flexDirection: 'row',
    gap: space.s,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: colors.sunk,
    alignItems: 'flex-start',
  },
  flag: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center', alignItems: 'center' },
  flagText: { fontSize: 14, color: colors.text, textDecorationLine: 'underline' },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.s,
    padding: space.m,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
