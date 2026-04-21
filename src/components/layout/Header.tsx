'use client';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
      {/* Add extra start padding on mobile to clear the hamburger button */}
      <div className="ps-12 lg:ps-0">
        <h1 className="text-xl md:text-3xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm md:text-base text-gray-600 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
