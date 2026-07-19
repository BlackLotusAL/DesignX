import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/primitives/Button';
import { FormField, Textarea } from '../../components/primitives/FormField';
import { Modal } from '../../components/primitives/Modal';

interface IgnoreFindingModalProps {
  findingTitle: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function IgnoreFindingModal({
  findingTitle,
  open,
  onClose,
  onConfirm,
}: IgnoreFindingModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Modal
      description="忽略后该发现不会出现在默认待处理列表中，原因会保存在本地工作区。"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            onClick={() => {
              onConfirm(reason);
              onClose();
            }}
            variant="danger"
          >
            确认忽略
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size="small"
      title="忽略发现"
    >
      <div className="confirm-summary">
        <AlertTriangle aria-hidden="true" size={18} />
        <strong>{findingTitle}</strong>
      </div>
      <FormField label="原因（可选）">
        <Textarea
          autoFocus
          onChange={(event) => setReason(event.target.value)}
          placeholder="例如：兼容旧版本协议，已纳入下一迭代…"
          rows={4}
          value={reason}
        />
      </FormField>
    </Modal>
  );
}
