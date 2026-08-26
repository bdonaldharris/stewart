interface HeaderProps {
  fixtureMode: boolean;
}

export function Header({ fixtureMode }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="flex items-center gap-4">
        <div className="brand-mark" aria-hidden="true">
          S
        </div>
        <div>
          <p className="brand-name">STEWART</p>
          <p className="brand-subtitle">
            An MCU Continuity Stewardship System
          </p>
        </div>
      </div>
      <div className="environment-label">
        <span />
        {fixtureMode ? "Development fixture" : "Backend adapter"}
      </div>
    </header>
  );
}
