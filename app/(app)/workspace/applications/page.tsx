import { requireContext } from "@/lib/auth";
import ApplicationCatalog from "@/components/workspace/ApplicationCatalog";
import { visibleWorkspaceSlugs } from "@/lib/module-access";
export default async function ApplicationHubPage(){const ctx=await requireContext();if(!ctx.featureAccess["workspace.applications"])return <><h1 className="section-title">Application Hub</h1><p className="subtitle">Akun Anda belum memiliki akses Workspace. Minta akses ke superadmin lewat Manajemen User.</p></>;return <><h1 className="section-title">Application Hub</h1><p className="subtitle">Akses cepat ke aplikasi eksternal operasional dan korporat.</p><ApplicationCatalog visibleSlugs={visibleWorkspaceSlugs(ctx.featureAccess, "app")}/></>}
