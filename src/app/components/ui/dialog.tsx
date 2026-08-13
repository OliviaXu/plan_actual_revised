import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";

export function Dialog(
  props: ComponentPropsWithoutRef<typeof DialogPrimitive.Root>,
) {
  return <DialogPrimitive.Root {...props} />;
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>((props, ref) => <DialogPrimitive.Title ref={ref} {...props} />);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>((props, ref) => <DialogPrimitive.Description ref={ref} {...props} />);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

type DialogContentProps =
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    onBackdropClick?: () => void;
  };

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, onBackdropClick, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className="fixed inset-0 z-40 bg-white/40 backdrop-blur-[1px]"
      data-testid="dialog-overlay"
      onClick={onBackdropClick}
    />
    <DialogPrimitive.Content
      className={
        className
          ? `fixed left-1/2 top-1/2 z-50 w-[min(25rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-white p-5 shadow-soft focus:outline-none ${className}`
          : "fixed left-1/2 top-1/2 z-50 w-[min(25rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-white p-5 shadow-soft focus:outline-none"
      }
      ref={ref}
      {...props}
    />
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;
