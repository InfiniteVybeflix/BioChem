import Image from "next/image";

/**
 * Brand logo tile — the official BioChem mark (public/brand/Logo.webp).
 * The artwork ships on its own deep-navy canvas, so the tile background
 * matches its edges and the mark reads cleanly in both themes.
 */
export function BrandLogo({
  className = "size-9",
  rounded = "rounded-xl",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-[#02060f] ring-1 ring-white/10 ${rounded} ${className}`}
      aria-hidden
    >
      <Image
        src="/brand/Logo.webp"
        alt=""
        fill
        sizes="(max-width: 640px) 36px, 48px"
        className="object-cover"
      />
    </span>
  );
}
