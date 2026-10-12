import { useGeolocation, useReverseGeolocation } from "~/hooks/use-geolocation";
import { Badge } from "@wadzzo/ui/components/badge";

interface LocationAddressDisplayProps {
  latitude: number;
  longitude: number;
}

export function LocationAddressDisplay({ latitude, longitude }: LocationAddressDisplayProps) {
  const { address, loading } = useReverseGeolocation(latitude, longitude);
  return (
    <Badge>
      <div className="flex items-center justify-between">
        <span className="truncate text-sm font-bold">{loading ? "Loading..." : address}</span>
      </div>
    </Badge>
  );
}
