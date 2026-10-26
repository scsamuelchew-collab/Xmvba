import { AdminNav } from "./admin-nav";
import { requireAdmin } from "@/lib/guards";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <AdminNav />
      {children}
    </div>
  );
}
