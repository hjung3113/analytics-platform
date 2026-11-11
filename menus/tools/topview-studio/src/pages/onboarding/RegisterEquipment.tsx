/**
 * 설비 등록 (#1658 import PR): an equipment id, a name and a Hub Model, as the dev tool's equipment record (`equipmentId`, `maker`, `model`).
 * The Models offered are the ones Fleet already shows (no Hub Model list read yet; CHANGELOG «Not implemented»). The server judges again.
 */
import { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useMenuAction, usePlatform } from '@ap/kernel';
import {
  Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FieldLabel, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ap/ui';
import { EQUIPMENT_LABEL_MAX, WINDOW_IMPORT_PERMISSION, registerEquipment, type FleetRowDto } from '../../endpoints';
import { equipmentIdProblem, registerFailure } from '../../model/onboarding';

const TITLE = '설비 등록';
/** Select value of a vendor and model pair; ids never contain a NUL. */
const pairKey = (vendorId: string, modelId: string) => `${vendorId}\u0000${modelId}`;

/** The 설비 등록 button for `eqv-studio:window-import` holders, opening the dialog. */
export function RegisterEquipmentControl({ rows }: { rows: readonly FleetRowDto[] }) {
  const { can } = usePlatform();
  const [open, setOpen] = useState(false);
  if (!can(WINDOW_IMPORT_PERMISSION)) return null;
  return <>
    <Button size="toolbar" variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" aria-hidden />{TITLE}</Button>
    {open && <RegisterEquipmentDialog rows={rows} onClose={() => setOpen(false)} />}
  </>;
}

function RegisterEquipmentDialog({ rows, onClose }: { rows: readonly FleetRowDto[]; onClose(): void }) {
  const { toast } = usePlatform();
  const run = useMenuAction(registerEquipment);
  const idInput = useRef<HTMLInputElement>(null);
  const [equipmentId, setEquipmentId] = useState('');
  const [label, setLabel] = useState('');
  const [pair, setPair] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const models = useMemo(() => {
    const byKey = new Map<string, { vendorId: string; modelId: string; text: string }>();
    for (const row of rows) byKey.set(pairKey(row.vendorId, row.modelId), { vendorId: row.vendorId, modelId: row.modelId, text: `${row.vendorName} / ${row.modelName}` });
    return [...byKey.entries()].sort(([, a], [, b]) => a.text.localeCompare(b.text));
  }, [rows]);
  const idProblem = equipmentIdProblem(equipmentId);
  const chosen = models.find(([key]) => key === pair)?.[1] ?? null;
  const reason = equipmentId === '' || label.trim() === '' || chosen === null ? '설비 ID, 이름, Model을 모두 정하세요.' : idProblem;
  const submit = async () => {
    if (reason !== null || chosen === null || run.pending) return;
    setFailure(null);
    try {
      const result = await run.run({ equipmentId, label: label.trim(), vendorId: chosen.vendorId, modelId: chosen.modelId });
      if (result.outcome === 'ok') { toast('설비를 등록했습니다', 'info'); onClose(); return; }
      setFailure(registerFailure(result));
    } catch { setFailure('등록하지 못했습니다. 다시 시도하세요.'); }
  };
  return <Dialog open onOpenChange={(next) => { if (!next && !run.pending) onClose(); }}>
    <DialogContent className="break-keep" onOpenAutoFocus={(event) => { event.preventDefault(); idInput.current?.focus(); }}>
      <DialogHeader>
        <DialogTitle>{TITLE}</DialogTitle>
        <DialogDescription>등록한 설비는 Fleet에 «관측 없음»으로 나타납니다. 그다음 Sample Window를 가져옵니다.</DialogDescription>
      </DialogHeader>
      <form noValidate id="register-equipment-form" className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="space-y-1"><FieldLabel htmlFor="register-equipment-id" required>설비 ID</FieldLabel>
          <Input ref={idInput} inputSize="toolbar" id="register-equipment-id" autoComplete="off" spellCheck={false} placeholder="eq-001" value={equipmentId} disabled={run.pending}
            aria-invalid={idProblem ? true : undefined} aria-describedby={idProblem ? 'register-equipment-id-error' : undefined} onChange={(event) => setEquipmentId(event.target.value)} />
          {idProblem && <p id="register-equipment-id-error" role="alert" className="text-xs text-text-danger">{idProblem}</p>}</div>
        <div className="space-y-1"><FieldLabel htmlFor="register-equipment-label" required>이름</FieldLabel>
          <Input inputSize="toolbar" id="register-equipment-label" autoComplete="off" maxLength={EQUIPMENT_LABEL_MAX} value={label} disabled={run.pending} onChange={(event) => setLabel(event.target.value)} /></div>
        <div className="space-y-1"><FieldLabel htmlFor="register-equipment-model" required>Model</FieldLabel>
          <Select value={pair} onValueChange={setPair} disabled={run.pending || models.length === 0}>
            <SelectTrigger id="register-equipment-model" density="compact"><SelectValue placeholder={models.length === 0 ? '고를 Model이 없습니다' : 'Model을 고르세요'} /></SelectTrigger>
            <SelectContent>{models.map(([key, model]) => <SelectItem key={key} value={key}>{model.text}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-text-muted">Fleet에 있는 설비사·Model 중에서 고릅니다.</p></div>
        {reason && !idProblem && <p id="register-equipment-reason" className="text-xs text-text-muted">{reason}</p>}
        {failure && <Callout tone="red"><span role="alert">{failure}</span></Callout>}
      </form>
      <DialogFooter>
        <Button size="toolbar" variant="secondary" disabled={run.pending} onClick={onClose}>취소</Button>
        <Button size="toolbar" variant="primary" type="submit" form="register-equipment-form" disabled={reason !== null || run.pending}
          aria-describedby={reason ? (idProblem ? 'register-equipment-id-error' : 'register-equipment-reason') : undefined}>등록</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
