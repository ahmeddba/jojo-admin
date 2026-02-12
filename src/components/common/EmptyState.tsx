type Props = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export const EmptyState: React.FC<Props> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center gap-2 bg-jojo-surface-light rounded-lg border border-dashed border-jojo-border">
    <p className="font-display text-lg text-jojo-text">{title}</p>
    {description && <p className="text-sm text-jojo-text-secondary">{description}</p>}
    {actionLabel && (
      <button
        className="mt-2 px-4 py-2 text-sm rounded-md bg-jojo-green text-white font-medium hover:bg-jojo-green-light"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    )}
  </div>
);
