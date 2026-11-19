export function MinesBotLogo({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2.5 shrink-0 select-none">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00D98B] via-[#38BDF8] to-[#8B5CF6] p-[1.5px] shrink-0 emerald-glow">
        <div className="w-full h-full rounded-[10px] bg-[#050A12] flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            aria-hidden="true"
          >
            <polygon
              points="12,2 21,8 17.5,21 6.5,21 3,8"
              stroke="#00D98B"
              strokeWidth="1.8"
              fill="rgba(0, 217, 139, 0.14)"
            />
            <polygon
              points="12,2 16,8 12,19 8,8"
              fill="#38BDF8"
              fillOpacity="0.45"
            />
          </svg>
        </div>
      </div>
      {!collapsed && (
        <span className="logo text-base sm:text-lg font-extrabold tracking-tight text-[#F4F7FC] whitespace-nowrap">
          Mines Bot
        </span>
      )}
    </div>
  );
}
