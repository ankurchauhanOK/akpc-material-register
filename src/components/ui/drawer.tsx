"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"

import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

function Drawer({
  side = "right",
  ...props
}: DrawerPrimitive.Root.Props & { side?: "left" | "right" }) {
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      swipeDirection={side === "right" ? "right" : "left"}
      {...props}
    />
  )
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 data-starting-style:animate-in data-starting-style:fade-in-0 data-ending-style:animate-out data-ending-style:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  side = "right",
  children,
  ...props
}: DrawerPrimitive.Popup.Props & { side?: "left" | "right" }) {
  const onRight = side === "right";
  return (
    <DrawerPrimitive.Portal>
      <DrawerOverlay />
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        className="fixed inset-0 z-50 flex data-[slot=drawer-viewport]:justify-end"
        style={{ justifyContent: onRight ? "flex-end" : "flex-start" }}
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            "flex h-full w-[20rem] max-w-[calc(100vw-3rem)] flex-col overflow-y-auto overscroll-contain bg-background text-foreground shadow-xl outline-none",
            onRight
              ? "border-l data-starting-style:animate-in data-starting-style:slide-in-from-right data-ending-style:animate-out data-ending-style:slide-out-to-right"
              : "border-r data-starting-style:animate-in data-starting-style:slide-in-from-left data-ending-style:animate-out data-ending-style:slide-out-to-left",
            className
          )}
          {...props}
        >
          {children}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-1 p-4", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function DrawerCloseButton({ onClick }: { onClick?: () => void }) {
  return (
    <DrawerClose
      render={
        <Button variant="ghost" size="icon-sm" onClick={onClick} />
      }
      aria-label="Close menu"
    >
      <XIcon />
    </DrawerClose>
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerCloseButton,
}
