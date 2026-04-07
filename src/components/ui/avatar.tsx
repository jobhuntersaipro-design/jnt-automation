import Image from "next/image";

type AvatarSize = "sm" | "md" | "lg";

interface UserAvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: AvatarSize;
  isSuperAdmin?: boolean;
}

const sizeMap: Record<AvatarSize, { container: string; text: string; image: number }> = {
  sm: { container: "w-7 h-7", text: "text-[0.65rem]", image: 28 },
  md: { container: "w-9 h-9", text: "text-xs", image: 36 },
  lg: { container: "w-11 h-11", text: "text-sm", image: 44 },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export function UserAvatar({
  name,
  imageUrl,
  size = "md",
  isSuperAdmin = false,
}: UserAvatarProps) {
  const { container, text, image } = sizeMap[size];
  const ringColor = isSuperAdmin
    ? "ring-critical"
    : "ring-outline-variant";

  if (imageUrl) {
    return (
      <div
        className={`${container} rounded-full ring-2 ${ringColor} overflow-hidden shrink-0`}
      >
        <Image
          src={imageUrl}
          alt={name}
          width={image}
          height={image}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${container} rounded-full ring-2 ${ringColor} bg-brand flex items-center justify-center ${text} font-bold text-white shrink-0`}
    >
      {getInitials(name)}
    </div>
  );
}
