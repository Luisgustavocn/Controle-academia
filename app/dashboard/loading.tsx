import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-5" aria-label="Carregando Dashboard" aria-busy="true">
      <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-72 max-w-full" /></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Card key={index}><SkeletonText lines={3} /></Card>)}</div>
      <Card><Skeleton className="mb-4 h-6 w-24" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div></Card>
      <div className="grid gap-4 lg:grid-cols-2"><Card><SkeletonText lines={5} /></Card><Card><SkeletonText lines={5} /></Card></div>
      <Card><Skeleton className="h-72" /></Card>
    </div>
  );
}
