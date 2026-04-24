'use client';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <div className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 sticky top-0 z-30">
      <div className="ps-12 lg:ps-0 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
          >
            {title}
          </h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}
