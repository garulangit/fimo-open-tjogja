import { requireContext } from "@/lib/auth";
import WorkDriveCatalog from "@/components/workspace/WorkDriveCatalog";
import { visibleWorkspaceSlugs } from "@/lib/module-access";
export default async function WorkDrivePage(){const ctx=await requireContext();if(!ctx.featureAccess["workspace.drive"])return <><h1 className="section-title">Work Drive</h1><p className="subtitle">Akun Anda belum memiliki akses Workspace. Minta akses ke superadmin lewat Manajemen User.</p></>;return <><h1 className="section-title">Work Drive</h1><p className="subtitle">Pusat akses dokumen dan referensi kerja eksternal.</p><WorkDriveCatalog visibleSlugs={visibleWorkspaceSlugs(ctx.featureAccess, "drive")}/></>}
