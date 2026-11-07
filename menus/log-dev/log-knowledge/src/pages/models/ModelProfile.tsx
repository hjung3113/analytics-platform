import { AlertTriangle, Plus } from 'lucide-react';
import { PlatformLink, useMenuQuery, useI18n, usePlatform, type PageProps } from '@ap/kernel';
import { PlatformPage, QueryView, ReturnLink, StateMessage } from '@ap/components';
import { Button } from '@ap/ui';
import { CATALOG_MANAGE_PERMISSION, modelProfileEndpoint, type ModelProfileData } from '../../endpoints';
import { SOFTWARE_LIST_NOTE, softwareTabPage } from './modelPresentation';
import { ModelItems } from './ModelItems';
import { EmptyNote, ModelMeta, ModelSummary, Section, SoftwareTable } from './ProfileParts';

const SECTIONS = [['summary', '모델 요약'], ['software', 'SW 버전'], ['items', '모델 공통 Item'], ['topview', 'Top View']] as const;
const anchor = (id: string) => `model-profile-${id}`;

function SectionNav() {
  return <nav aria-label="섹션 이동" className="sticky top-[var(--page-sticky-offset,0px)] z-10 -mx-1 flex gap-1 bg-surface-canvas px-1 py-1">
    {SECTIONS.map(([id, label]) => <Button key={id} type="button" size="sm" variant="ghost" onClick={() => document.getElementById(anchor(id))?.scrollIntoView?.({ block: 'start' })}>{label}</Button>)}
  </nav>;
}

function Sections({ profile, modelId, canEdit }: { profile: ModelProfileData; modelId: string; canEdit: boolean }) {
  const { linkTo } = usePlatform();
  const { tx } = useI18n();
  const addSoftware = canEdit ? <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('log-knowledge-catalog', { page: softwareTabPage(modelId) })}><Plus className="size-3.5" aria-hidden />SW 버전 추가</PlatformLink></Button> : null;
  const { softwareVersions, truncated } = profile;
  return <div className="grid gap-3">
    <SectionNav />
    <Section id={anchor('summary')} title="모델 요약"><ModelSummary model={profile.model} /></Section>
    <Section id={anchor('software')} title="SW 버전" count={softwareVersions.length}>
      {softwareVersions.length === 0 ? <EmptyNote text="등록된 SW 버전이 없습니다" action={addSoftware} /> : <div className="grid gap-2">
        <SoftwareTable versions={softwareVersions} />
        {truncated && <p className="text-xs text-text-muted">{SOFTWARE_LIST_NOTE}</p>}
      </div>}
    </Section>
    <Section id={anchor('spec')} title={tx({ ko: '명세', en: 'Specification' })}>
      <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('log-knowledge-spec', { params: { modelId }, returnTo: true })}>{tx({ ko: '모델 명세 보기', en: 'View model specification' })}</PlatformLink></Button>
    </Section>
    <Section id={anchor('items')} title="모델 공통 Item"><ModelItems modelId={modelId} active={profile.model.active} /></Section>
    <Section id={anchor('topview')} title="Top View"><p className="text-sm text-text-muted">연결된 Top View가 없습니다</p></Section>
  </div>;
}

/**
 * 모델 공통 프로파일 (#1197 s1, owner-confirmed variant A): the sections of one model stacked in reading order under a section nav. The path names
 * the model (`modelId`); the crumb names its 설비사. The read answers `null` for an unknown id, shown as a not-found state.
 */
export default function ModelProfile({ params }: PageProps) {
  const modelId = params.modelId ?? '';
  const { can, linkTo } = usePlatform();
  const query = useMenuQuery(modelProfileEndpoint, { modelId });
  const profile = query.response?.outcome === 'ok' ? query.response.data : null;
  const canEdit = can(CATALOG_MANAGE_PERMISSION);
  return <PlatformPage title={profile?.model.name} crumbs={profile ? [{ label: profile.model.vendor.name }] : []} secondaryActions={<ReturnLink />}
    primaryAction={profile && canEdit && <Button asChild variant="secondary"><PlatformLink href={linkTo('log-knowledge-catalog', { page: softwareTabPage(modelId) })}><Plus className="size-3.5" aria-hidden />SW 버전 추가</PlatformLink></Button>}>
    <div className="grid gap-3">
      {profile && <ModelMeta model={profile.model} />}
      <QueryView widgetName="모델 프로파일" query={query}>{data => data
        ? <Sections profile={data} modelId={modelId} canEdit={canEdit} />
        : <StateMessage icon={<AlertTriangle className="size-4" aria-hidden />} title="이 모델을 찾을 수 없습니다" body="삭제되었거나 주소의 모델 ID가 틀렸습니다."
          action={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('log-knowledge-models')}>모델 탐색으로</PlatformLink></Button>} />}
      </QueryView>
    </div>
  </PlatformPage>;
}
