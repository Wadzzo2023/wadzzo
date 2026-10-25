"use client";

import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { Plus } from "lucide-react";

import { cn } from "@wadzzo/ui/lib/cn";

const Accordion = AccordionPrimitive.Root;

/** One section: a chunky bordered block. */
const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn(
      "border-foreground/10 bg-surface data-[state=open]:border-foreground overflow-hidden rounded-[1.4rem] border-2 transition-colors",
      className,
    )}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

/** Section title in condensed type, with a plus in a circle that turns into a cross when open. */
const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "group hover:bg-foreground/[0.03] flex flex-1 items-center justify-between gap-4 px-5 py-4 text-left transition-colors",
        className,
      )}
      {...props}
    >
      <span className="display text-3xl">{children}</span>
      <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-data-[state=open]:rotate-45">
        <Plus className="size-5" strokeWidth={2.8} />
      </span>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden"
    {...props}
  >
    <div className={cn("border-foreground/10 border-t-2 border-dashed px-5 pt-4 pb-5", className)}>
      {children}
    </div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
