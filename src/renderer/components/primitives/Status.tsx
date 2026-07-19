import type {
  FindingSeverity,
  FindingStatus,
  KnowledgeStatus,
  RepositoryStatus,
  TaskStatus,
} from '../../types';

type StatusValue =
  | RepositoryStatus
  | KnowledgeStatus
  | TaskStatus
  | FindingSeverity
  | FindingStatus;

const labels: Record<StatusValue, string> = {
  clean: '工作区干净',
  dirty: '有未提交修改',
  ahead: '有本地变更',
  diverged: '分支已分叉',
  syncing: '正在同步',
  error: '需要处理',
  published: '已发布',
  draft: '待完善',
  queued: '排队中',
  running: '分析中',
  completed: '已完成',
  partial: '部分失败',
  failed: '失败',
  high: '高',
  medium: '中',
  low: '低',
  open: '待处理',
  ignored: '已忽略',
};

export function Status({ value, label }: { value: StatusValue; label?: string }) {
  return (
    <span className={`status status--${value}`}>
      <span aria-hidden="true" className="status__dot" />
      {label ?? labels[value]}
    </span>
  );
}
