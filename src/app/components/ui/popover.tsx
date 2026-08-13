import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";

export function Popover(
  props: ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>,
) {
  return <PopoverPrimitive.Root {...props} />;
}

export const PopoverTrigger = forwardRef<
  ElementRef<typeof PopoverPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>((props, ref) => <PopoverPrimitive.Trigger ref={ref} {...props} />);
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    backdrop?: boolean;
  }
>(({ backdrop = false, className, sideOffset = 6, ...props }, ref) => (
  <>
    {backdrop ? (
      <PopoverPrimitive.Portal>
        <div
          aria-hidden="true"
          className="fixed inset-0 z-20 bg-white/40 backdrop-blur-[1px]"
          data-testid="popover-backdrop"
        />
      </PopoverPrimitive.Portal>
    ) : null}
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        className={
          className
            ? `z-30 rounded-md border border-border bg-white outline-none ${className}`
            : "z-30 rounded-md border border-border bg-white outline-none"
        }
        ref={ref}
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  </>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
