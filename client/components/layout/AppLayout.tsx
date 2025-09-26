import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarDays, Store } from "lucide-react";

interface AppContextValue {
  branch: string;
  setBranch: (b: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppLayout");
  return ctx;
};

const branches = ["สาขา A", "สาขา B", "สาขา C"];

export default function AppLayout({ children }: { children: ReactNode }) {
  const [branch, setBranch] = useState<string>(branches[0]);

  const value = useMemo(() => ({ branch, setBranch }), [branch]);
  const today = new Date();
  const dateStr = today.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <AppContext.Provider value={value}>
      <div className="min-h-screen bg-gradient-to-b from-white to-muted/30">
        <header className="sticky top-0 z-30 w-full border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="container mx-auto flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className={cn("size-8 rounded-md border", "bg-gradient-to-br from-primary to-primary/70")}></div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm text-muted-foreground">Bakery Section</span>
                <h1 className="text-lg font-bold tracking-tight">เบเกอรี่วันนี้</h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                <span>{dateStr}</span>
              </div>
              <div className="flex items-center gap-2">
                <Store className="size-4 text-primary" />
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="เลือกสาขา" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6">{children}</main>
      </div>
    </AppContext.Provider>
  );
}
