import { motion } from "framer-motion";

/**
 * The AR screen's collect action: the "Collect" scan-tile art as the button
 * itself. Same art in the mobile app (`assets/images/collect-button.png`).
 */
export function CollectButton({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-label={`Collect ${title}`}
      className="mx-auto block h-[124px] w-[124px] rounded-ar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ar-green"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static art, same as the rest of the AR HUD */}
      <img
        src="/images/collect-button.png"
        alt=""
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </motion.button>
  );
}
