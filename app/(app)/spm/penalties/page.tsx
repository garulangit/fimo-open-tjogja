import {requireContext} from "@/lib/auth";
import { canRead } from "@/lib/module-access";import {PenaltiesPrototype} from "@/components/spm/WorkflowPrototype";export default async function Page(){const c=await requireContext();if(!c.featureAccess["spm.penalties"])return <p>Akses submenu Denda SPM dibatasi untuk akun Anda.</p>;return <PenaltiesPrototype/>}
