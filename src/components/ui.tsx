import * as Dialog from '@radix-ui/react-dialog';
import { X, ArrowUpRight, Inbox } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useModalError } from '../app/context';
import {
  useId,
  cloneElement,
  type ReactElement,
  type ReactNode,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from 'react';
export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));
export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return <button className={cn('button', variant, className)} {...props} />;
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  detail = false,
  onCloseAutoFocus,
  onOpenAutoFocus,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  detail?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  onOpenAutoFocus?: (event: Event) => void;
}) {
  const error = useModalError();
  const descriptionId = useId();
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn('modal', wide && 'wide', detail && 'detail-modal')}
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id={descriptionId}>{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Cerrar">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          {detail ? (
            <div className="modal-body">
              {error && <div className="feedback-dock modal-error">{error}</div>}
              {children}
            </div>
          ) : (
            <>
              {error && <div className="feedback-dock modal-error">{error}</div>}
              {children}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {cloneElement(children as ReactElement<HTMLAttributes<HTMLElement>>, {
        id: fieldId,
        'aria-describedby': hint ? `${fieldId}-hint` : undefined,
      })}
      {hint && <small id={`${fieldId}-hint`}>{hint}</small>}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Kpi({
  label,
  value,
  hint,
  tone = '',
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={cn('kpi', tone === 'featured' && 'featured')}>
      <div className="kpi-label">
        {label}
        {icon || <ArrowUpRight size={17} />}
      </div>
      <strong className={tone !== 'featured' ? tone : ''}>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
export const signClass = (n: number) => (n > 0 ? 'positive' : n < 0 ? 'negative' : '');
export function Badge({ status }: { status: string }) {
  return (
    <span className={cn('badge', status.toLowerCase())}>
      <i />
      {status}
    </span>
  );
}
