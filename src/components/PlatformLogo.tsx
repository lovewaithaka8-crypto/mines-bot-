import { Globe } from 'lucide-react';

export function PlatformLogo({
  shortCode,
  brandColor,
  isCustomSlot = false,
  size = 'md',
}: {
  shortCode: string;
  brandColor: string;
  isCustomSlot?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const boxSize =
    size === 'sm'
      ? 'w-9 h-9 rounded-xl text-xs'
      : size === 'lg'
        ? 'w-14 h-14 rounded-2xl text-base'
        : 'w-11 h-11 rounded-xl text-xs';

  return (
    <div
      className={`${boxSize} flex items-center justify-center font-display font-extrabold tracking-tight shrink-0 border select-none relative overflow-hidden`}
      style={{
        backgroundColor: `${brandColor}1A`,
        borderColor: `${brandColor}55`,
        color: brandColor,
        boxShadow: `0 0 18px ${brandColor}22`,
      }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 opacity-20"
        style={{
          background: `radial-gradient(circle at 25% 20%, ${brandColor}, transparent 70%)`,
        }}
      />
      {isCustomSlot ? (
        <Globe className={size === 'lg' ? 'w-6 h-6' : 'w-4 h-4'} />
      ) : (
        <span className="relative z-10">{shortCode}</span>
      )}
    </div>
  );
}
