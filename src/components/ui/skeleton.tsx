import { cn } from "@/lib/utils";

/** Bloc gris qui annonce un contenu en cours de chargement. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("bg-muted motion-safe:animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
