// SPIKE (#52, throwaway): @fops/ui rendered by the platform app's Vite + Tailwind v4 pipeline.
import '@fontsource-variable/inter';
import './fops-spike.css';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Callout,
  DatePicker,
  DetailPanelHeader,
  EmptyState,
  FieldRow,
  Input,
  ListShell,
  ListToolbar,
  PanelSectionTitle,
  ReporterStatusBadge,
  SearchInput,
  SeverityBadge,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@fops/ui';

function Spike() {
  const [date, setDate] = useState<string | null>('2026-10-04');
  return (
    <div className="flex h-full bg-surface-canvas text-text-primary">
      <ListShell
        toolbar={{ title: '@fops/ui spike — ListShell' }}
        tabs={<ListToolbar title="목록" tabs={[{ value: 'all', label: '전체', badgeCount: 12 }, { value: 'high', label: '높음', badgeCount: 3 }]} activeTab="all" />}
        list={
          <div className="space-y-3 overflow-auto p-4">
            <Card>
              <CardHeader><CardTitle>Card / Button / Input</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button>기본</Button>
                  <Button variant="secondary">보조</Button>
                  <Button variant="ghost">고스트</Button>
                  <Button variant="destructive">삭제</Button>
                </div>
                <Input placeholder="입력" />
                <SearchInput placeholder="검색" />
                <DatePicker value={date} onChange={setDate} aria-label="날짜" />
                <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">탭 A</TabsTrigger><TabsTrigger value="b">탭 B</TabsTrigger></TabsList></Tabs>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Badges / Callout / EmptyState</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <SeverityBadge severity="low" /><SeverityBadge severity="medium" /><SeverityBadge severity="high" /><SeverityBadge severity="critical" />
                  <ReporterStatusBadge status="received" /><ReporterStatusBadge status="progress" />
                </div>
                <Callout tone="amber">주의 콜아웃</Callout>
                <EmptyState title="데이터 없음" body="조건을 바꿔 보세요" size="sm" />
              </CardContent>
            </Card>
          </div>
        }
      />
      <aside className="w-[420px] border-l border-border-subtle bg-surface-card">
        <DetailPanelHeader kind="voc" id="VOC-1024" onClose={() => {}} />
        <div className="space-y-2 p-4">
          <PanelSectionTitle>상세</PanelSectionTitle>
          <FieldRow label="상태"><ReporterStatusBadge status="assigned" /></FieldRow>
          <FieldRow label="심각도"><SeverityBadge severity="high" /></FieldRow>
        </div>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Spike /></StrictMode>);
