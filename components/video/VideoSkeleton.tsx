export function VideoCardSkeleton({ horizontal = false }: { horizontal?: boolean }) {
  if (horizontal) {
    return (
      <div className="flex gap-4 p-2">
        <div className="skeleton w-[168px] h-[94px] md:w-[240px] md:h-[135px] rounded-lg shrink-0" />
        <div className="flex-1 py-1">
          <div className="skeleton h-4 w-3/4 mb-2" />
          <div className="skeleton h-3 w-1/3 mb-1" />
          <div className="skeleton h-3 w-1/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="skeleton w-full aspect-video rounded-lg mb-3" />
      <div className="flex gap-3">
        <div className="skeleton w-9 h-9 rounded-full shrink-0" />
        <div className="flex-1">
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-3 w-1/2 mb-1" />
          <div className="skeleton h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function VideoGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
