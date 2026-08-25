interface HeaderProps {
  fixtureMode: boolean;
}

export function Header({ fixtureMode }: HeaderProps) {
  return (
    <header className="mx-auto flex w-full max-w-[1480px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <div className="flex items-center gap-4">
        <div className="brand-mark" aria-hidden="true">
          S
        </div>
        <div>
          <p className="text-[0.67rem] font-semibold tracking-[0.38em] text-[#d4b47b]">STEWART</p>
          <p className="mt-1 text-xs tracking-[0.08em] text-slate-400 sm:text-sm">
            An MCU Continuity Stewardship System
          </p>
        </div>
      </div>
      <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
        <span className={`h-1.5 w-1.5 rounded-full ${fixtureMode ? "bg-amber-300" : "bg-emerald-300"}`} />
        {fixtureMode ? "Development fixture" : "Backend adapter"}
      </div>
    </header>
  );
}
