import { requireContext } from "@/lib/auth";
import { canRead } from "@/lib/module-access";
import SpmPrototype from "@/components/spm/SpmPrototype";
export default async function SpmPage(){const ctx=await requireContext();if(!ctx.featureAccess["spm.overview"])return <><h1 className="section-title">Denda SPM</h1><p className="subtitle">Akses modul dibatasi — minta admin mencentang modul SPM untuk akun Anda.</p></>;return <><h1 className="section-title">Denda SPM</h1><p className="subtitle">Dashboard pengelolaan dan monitoring pelanggaran.</p><SpmPrototype/></>}
