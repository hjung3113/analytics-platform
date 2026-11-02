import { useMenuAction, usePlatform } from '@ap/kernel';
import { useHeaderOverflowDialog } from '@ap/components';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button } from '@ap/ui';
import { itemSetArchived, type ItemDetail } from '../../endpoints';
import { itemNoLabel } from './itemModel';

type Item = ItemDetail['item'];

function ArchiveDialog({ item, archive, onClose, onCloseAutoFocus, onChanged }: { item: Item; archive: boolean; onClose: () => void; onCloseAutoFocus: (event: Event) => void; onChanged: () => void }) {
  const { toast } = usePlatform();
  const setArchived = useMenuAction(itemSetArchived);
  const confirm = () => {
    void setArchived.run({ id: item.id, archived: archive }, { expectedVersion: item.version }).then(res => {
      if (res.outcome === 'ok') toast(archive ? '보관했습니다' : '보관을 해제했습니다', 'info');
      else if (res.outcome === 'conflict') { toast('다른 사람이 먼저 고쳤습니다', 'warning', '새로 불러온 뒤 다시 시도해 주세요.'); onChanged(); }
      else toast('저장하지 못했습니다', 'danger', res.outcome === 'unknown' ? '저장됐는지 확인하지 못했습니다.' : undefined);
      onClose();
    }).catch(() => onClose());
  };
  return <AlertDialog open onOpenChange={open => { if (!open && !setArchived.pending) onClose(); }}>
    <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>{itemNoLabel(item.itemNo)}을(를) {archive ? '보관할까요?' : '보관 해제할까요?'}</AlertDialogTitle>
        <AlertDialogDescription>
          {archive ? '보관해도 Item은 읽을 수 있고 리비전·판단 변경 이력은 그대로 남습니다. 수정과 판단 변경은 보관을 해제한 뒤에 할 수 있습니다.' : '보관을 해제하면 다시 게시된 Item이 되어 수정과 판단 변경을 할 수 있습니다. 이력은 그대로 남아 있습니다.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={setArchived.pending}>취소</AlertDialogCancel>
        {/* A plain button, not AlertDialogAction: the dialog stays open until the write answers. */}
        <Button type="button" disabled={setArchived.pending} onClick={confirm}>{setArchived.pending ? '저장 중…' : archive ? '보관' : '보관 해제'}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

/** `보관` / `보관 해제` in the page header's `⋯` menu (ADR-0035); the confirm dialog is handed to the header, which keeps it mounted after the menu closes. */
export function ArchiveAction({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const show = useHeaderOverflowDialog();
  const archive = item.publicationState !== 'archived';
  return <Button type="button" variant="ghost" size="sm" className="w-full justify-start"
    onClick={() => show?.(control => <ArchiveDialog item={item} archive={archive} onClose={control.close} onCloseAutoFocus={control.onCloseAutoFocus} onChanged={onChanged} />)}>
    {archive ? '보관' : '보관 해제'}
  </Button>;
}
