"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

function Checkbox({
  className,
  appearance = "default",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  appearance?: "default" | "luxmotion"
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-6 shrink-0 transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50",
        appearance === "luxmotion"
          ? "rounded-none border border-[var(--ck-border-strong,rgba(201,169,110,0.4))] bg-transparent focus-visible:border-[var(--ck-accent,#c9a96e)] focus-visible:ring-[3px] focus-visible:ring-[rgba(var(--ck-accent-rgb,201,169,110),0.3)] data-[state=checked]:border-[var(--ck-accent,#c9a96e)] data-[state=checked]:bg-[var(--ck-accent,#c9a96e)]"
          : "checkbox-custom rounded-md border-2 border-[#b8e8f5] bg-white focus-visible:border-[#27c7ff] focus-visible:ring-[3px] focus-visible:ring-[#27c7ff]/30",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn("flex items-center justify-center transition-none", appearance === "luxmotion" ? "text-[#0d0d0d]" : "text-white")}
      >
        <CheckIcon className="size-4 stroke-[3]" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
