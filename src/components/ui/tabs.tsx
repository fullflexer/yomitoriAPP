"use client";

import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode
} from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  defaultValue: string;
  children: ReactNode;
}

export function Tabs({ defaultValue, children, className, ...props }: TabsProps) {
  const [value, setValue] = useState(defaultValue);
  const baseId = useId();

  const context = useMemo(() => ({ value, setValue, baseId }), [baseId, value]);

  return (
    <TabsContext.Provider value={context}>
      <div className={cn("space-y-4", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1",
        className
      )}
      {...props}
    />
  );
}

export interface TabsTriggerProps
  extends HTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const context = useContext(TabsContext);

  if (!context) {
    throw new Error("TabsTrigger must be used within Tabs");
  }

  const selected = context.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={`${context.baseId}-panel-${value}`}
      id={`${context.baseId}-tab-${value}`}
      onClick={() => context.setValue(value)}
      className={cn(
        "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
        selected
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-600 hover:text-slate-900",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps
  extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: TabsContentProps) {
  const context = useContext(TabsContext);

  if (!context) {
    throw new Error("TabsContent must be used within Tabs");
  }

  if (context.value !== value) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={`${context.baseId}-panel-${value}`}
      aria-labelledby={`${context.baseId}-tab-${value}`}
      className={cn("space-y-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}
