import type { TreeNode } from '../types';

interface Props {
  path: TreeNode[];
  onSelect: (id: string) => void;
}

export function Breadcrumb({ path, onSelect }: Props) {
  if (!path.length) return null;
  return (
    <div className="breadcrumb">
      <button type="button" onClick={() => onSelect('root')}>
        Root
      </button>
      {path.map((n, i) => (
        <span key={n.id}>
          <span> / </span>
          {i < path.length - 1 ? (
            <button type="button" onClick={() => onSelect(n.id)}>
              {n.label.length > 24 ? n.label.slice(0, 22) + '…' : n.label}
            </button>
          ) : (
            <span>{n.label.length > 28 ? n.label.slice(0, 26) + '…' : n.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
