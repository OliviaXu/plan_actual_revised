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
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
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
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
